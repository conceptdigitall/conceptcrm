import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { loadAiConfig } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import {
  DEFAULT_SETTINGS,
  buildCaptionOptions,
  captionSystemPrompt,
  parseCaptionOptions,
} from '@/lib/marketing/content';
import type { MarketingSettings } from '@/types';

const MAX_IDEA = 1000;

/**
 * POST /api/marketing/caption  (agent+)
 *
 * Body: { idea }
 * Returns: { options: string[], source: 'ai' | 'local' }
 *
 * Gera 3 legendas com a IA configurada da conta (Ajustes → Assistente de IA).
 * Sem IA configurada ou se o provedor falhar, devolve 3 variações locais por
 * estilo, para o botão nunca ficar sem resposta. Não grava nada.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');

    const userLimit = checkRateLimit(`mkt-caption:${userId}`, RATE_LIMITS.aiDraft);
    if (!userLimit.success) return rateLimitResponse(userLimit);

    const body = (await request.json().catch(() => null)) as { idea?: unknown } | null;
    const idea = typeof body?.idea === 'string' ? body.idea.trim().slice(0, MAX_IDEA) : '';
    if (!idea) {
      return NextResponse.json({ error: 'Escreva a ideia do post' }, { status: 400 });
    }

    const { data } = await supabase
      .from('marketing_settings')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();
    const settings = (data as MarketingSettings | null) ?? { ...DEFAULT_SETTINGS, account_id: accountId };
    const local = () => NextResponse.json({ options: buildCaptionOptions(settings, idea), source: 'local' });

    const config = await loadAiConfig(supabase, accountId).catch(() => null);
    if (!config) return local();

    try {
      const { text } = await generateReply({
        config,
        systemPrompt: captionSystemPrompt(settings),
        messages: [{ role: 'user', content: idea }],
      });
      const options = parseCaptionOptions(text);
      if (options.length === 0) return local();
      return NextResponse.json({ options, source: 'ai' });
    } catch (err) {
      console.error('[marketing/caption] IA falhou, usando legendas locais:', err);
      return local();
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
