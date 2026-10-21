import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { DEFAULT_SETTINGS } from '@/lib/marketing/content';
import type { MarketingSettings } from '@/types';

export async function GET() {
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }

  const { data } = await ctx.supabase
    .from('marketing_settings')
    .select('*')
    .eq('account_id', ctx.accountId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({
      settings: { ...DEFAULT_SETTINGS, account_id: ctx.accountId },
    });
  }

  return NextResponse.json({ settings: data as MarketingSettings });
}

export async function PUT(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as Partial<MarketingSettings> | null;
  if (!body) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    account_id: ctx.accountId,
    updated_at: new Date().toISOString(),
  };

  if (body.business_name !== undefined) payload.business_name = body.business_name.trim();
  if (body.business_niche !== undefined) payload.business_niche = body.business_niche;
  if (body.caption_style !== undefined) payload.caption_style = body.caption_style;
  if (body.caption_size !== undefined) payload.caption_size = body.caption_size;
  if (body.emoji_level !== undefined) payload.emoji_level = body.emoji_level;
  if (body.cta !== undefined) payload.cta = body.cta.trim();
  if (body.never_use !== undefined) payload.never_use = body.never_use.trim();
  if (body.hashtags !== undefined) payload.hashtags = body.hashtags;
  if (body.require_approval !== undefined) payload.require_approval = body.require_approval;
  if (body.approver_whatsapp !== undefined) {
    payload.approver_whatsapp = body.approver_whatsapp ? body.approver_whatsapp.trim() : null;
  }
  if (body.daily_schedule_time !== undefined) payload.daily_schedule_time = body.daily_schedule_time.trim();
  if (body.autopilot_frequency !== undefined) payload.autopilot_frequency = body.autopilot_frequency;
  if (body.tutorial_completed !== undefined) payload.tutorial_completed = body.tutorial_completed;
  if (body.instagram_username !== undefined) {
    payload.instagram_username = body.instagram_username ? body.instagram_username.trim() : null;
  }

  const { data, error } = await ctx.supabase
    .from('marketing_settings')
    .upsert(payload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data as MarketingSettings });
}
