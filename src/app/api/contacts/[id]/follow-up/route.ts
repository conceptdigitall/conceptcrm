import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { engineSendText } from '@/lib/flows/meta-send';
import { buildCandidateModels } from '@/lib/whatsapp/evolution-bot';
import {
  buildFollowupPrompt,
  cleanFollowupText,
  coolingDays,
  firstNameOf,
  outboundSinceLastReply,
  pickAngle,
  tooSimilar,
} from '@/lib/followup/followup';

export const maxDuration = 60;

const MAX_TEXT = 1000;
const TRANSCRIPT_MESSAGES = 16;

type Ctx = Awaited<ReturnType<typeof requireRole>>;

async function loadThread(ctx: Ctx, contactId: string) {
  const { data: contact } = await ctx.supabase
    .from('contacts')
    .select('id, name, account_id')
    .eq('id', contactId)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  if (!contact) return null;

  const { data: conv } = await ctx.supabase
    .from('conversations')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return { contact, conversationId: (conv?.id as string | undefined) ?? null };
}

/**
 * POST /api/contacts/:id/follow-up  (agent+)
 *   { action: 'generate' }        → { text, daysWaiting }
 *   { action: 'send', text }      → envia pelo WhatsApp e salva na inbox
 *
 * Sempre com o João aprovando: gerar não envia nada.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole('agent');
    const { id: contactId } = await params;
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      text?: unknown;
    } | null;

    const thread = await loadThread(ctx, contactId);
    if (!thread) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }
    if (!thread.conversationId) {
      return NextResponse.json(
        { error: 'Esse contato ainda não tem conversa no WhatsApp.' },
        { status: 400 },
      );
    }

    if (body?.action === 'send') {
      const limit = checkRateLimit(`followup-send:${ctx.userId}`, RATE_LIMITS.send);
      if (!limit.success) return rateLimitResponse(limit);

      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text || text.length > MAX_TEXT) {
        return NextResponse.json({ error: 'Mensagem vazia ou longa demais.' }, { status: 400 });
      }
      await engineSendText({
        accountId: ctx.accountId,
        userId: ctx.userId,
        conversationId: thread.conversationId,
        contactId,
        text,
        aiGenerated: true,
      });
      return NextResponse.json({ ok: true });
    }

    if (body?.action !== 'generate') {
      return NextResponse.json({ error: 'action inválida' }, { status: 400 });
    }

    const limit = checkRateLimit(`followup-gen:${ctx.userId}`, RATE_LIMITS.aiDraft);
    if (!limit.success) return rateLimitResponse(limit);

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada.' }, { status: 500 });
    }

    const [{ data: msgs }, { data: deals }, { data: cfg }] = await Promise.all([
      ctx.supabase
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', thread.conversationId)
        .order('created_at', { ascending: false })
        .limit(40),
      ctx.supabase
        .from('deals')
        .select('title, status, stage:pipeline_stages(name)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1),
      ctx.supabase.from('ai_configs').select('model').eq('account_id', ctx.accountId).maybeSingle(),
    ]);

    const rows = (msgs ?? []).slice().reverse();
    const last = rows[rows.length - 1];
    const daysWaiting = coolingDays(last ?? null);
    const previous = outboundSinceLastReply(rows).slice(-8);
    const transcript = rows
      .slice(-TRANSCRIPT_MESSAGES)
      .filter((r) => r.content_text?.trim())
      .map((r) => `${r.sender_type === 'customer' ? 'Cliente' : 'Nós'}: ${r.content_text!.trim().slice(0, 400)}`)
      .join('\n');

    const deal = deals?.[0] as
      | { title: string | null; status: string | null; stage: { name: string } | { name: string }[] | null }
      | undefined;
    const stageName = Array.isArray(deal?.stage) ? deal?.stage[0]?.name : deal?.stage?.name;
    const dealContext = deal ? [deal.title, stageName].filter(Boolean).join(' · ') : null;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const models = buildCandidateModels(cfg?.model, process.env.CLAUDE_MODEL);

    let text = '';
    // Até 2 tentativas: se sair parecido demais com um follow-up anterior,
    // gera de novo com outro ângulo.
    for (let attempt = 0; attempt < 2 && !text; attempt++) {
      const { system, user } = buildFollowupPrompt({
        firstName: firstNameOf(thread.contact.name),
        daysWaiting,
        dealContext,
        transcript,
        previousFollowups: previous,
        angle: pickAngle(previous.length + attempt),
      });
      for (const model of models) {
        try {
          const res = await anthropic.messages.create({
            model,
            max_tokens: 200,
            temperature: 1,
            system,
            messages: [{ role: 'user', content: user }],
          });
          const block = res.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
          const candidate = cleanFollowupText(block?.text || '');
          if (candidate && (!tooSimilar(candidate, previous) || attempt === 1)) text = candidate;
          break;
        } catch (err) {
          console.warn(`[follow-up] modelo ${model} falhou:`, (err as Error)?.message || err);
        }
      }
    }

    if (!text) {
      return NextResponse.json({ error: 'Não consegui gerar a mensagem agora. Tente de novo.' }, { status: 502 });
    }
    return NextResponse.json({ text, daysWaiting });
  } catch (error) {
    return toErrorResponse(error);
  }
}
