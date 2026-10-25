import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { DEFAULT_SETTINGS } from '@/lib/marketing/content';
import {
  buildQuickInputDraft,
  buildWhatsAppApprovalMessage,
  generateDailyAutopilotDrafts,
} from '@/lib/marketing/niche-autopilot';
import type { MarketingPost, MarketingSettings } from '@/types';
import { dbErrorResponse } from '@/lib/marketing/db-error';

interface AutopilotRequestBody {
  action: 'generate_daily' | 'quick_input' | 'notify_whatsapp';
  text?: string;
  kind?: 'feed' | 'story';
  mediaUrl?: string;
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as AutopilotRequestBody | null;
  if (!body?.action) {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  }

  const { data: settingsRow } = await ctx.supabase
    .from('marketing_settings')
    .select('*')
    .eq('account_id', ctx.accountId)
    .maybeSingle();

  const settings: MarketingSettings = settingsRow
    ? (settingsRow as MarketingSettings)
    : { ...DEFAULT_SETTINGS, account_id: ctx.accountId };

  if (body.action === 'generate_daily') {
    const drafts = generateDailyAutopilotDrafts(settings);
    const rows = drafts.map((d) => ({
      ...d,
      account_id: ctx.accountId,
      created_by: ctx.userId,
    }));

    const { data, error } = await ctx.supabase
      .from('marketing_posts')
      .insert(rows)
      .select();

    if (error) {
      return dbErrorResponse('autopilot', error);
    }

    const createdPosts = (data || []) as MarketingPost[];
    const whatsappMessage = buildWhatsAppApprovalMessage(createdPosts, settings);
    return NextResponse.json({ posts: createdPosts, whatsappMessage }, { status: 201 });
  }

  if (body.action === 'quick_input') {
    const text = (body.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Informe ou grave o que deseja postar' }, { status: 400 });
    }

    const draft = buildQuickInputDraft(
      { text, kind: body.kind === 'story' ? 'story' : 'feed', mediaUrl: body.mediaUrl },
      settings,
    );

    const { data, error } = await ctx.supabase
      .from('marketing_posts')
      .insert({
        ...draft,
        account_id: ctx.accountId,
        created_by: ctx.userId,
      })
      .select()
      .single();

    if (error) {
      return dbErrorResponse('autopilot', error);
    }

    const post = data as MarketingPost;
    const whatsappMessage = buildWhatsAppApprovalMessage([post], settings);
    return NextResponse.json({ post, whatsappMessage }, { status: 201 });
  }

  if (body.action === 'notify_whatsapp') {
    const { data: pending } = await ctx.supabase
      .from('marketing_posts')
      .select('kind, title, status')
      .eq('account_id', ctx.accountId)
      .in('status', ['pending_approval', 'scheduled'])
      .order('created_at', { ascending: false })
      .limit(6);

    const list = pending && pending.length > 0
      ? pending
      : [{ kind: 'feed', title: 'Pauta do dia pronta para revisão', status: 'pending_approval' }];

    const whatsappMessage = buildWhatsAppApprovalMessage(list, settings);
    const digits = (settings.approver_whatsapp || '').replace(/\D/g, '');
    const whatsappUrl = digits
      ? `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}?text=${encodeURIComponent(whatsappMessage)}`
      : null;

    return NextResponse.json({ whatsappMessage, whatsappUrl });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
