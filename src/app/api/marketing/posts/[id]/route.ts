import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { MarketingPost, PostStatus } from '@/types';
import { dbErrorResponse } from '@/lib/marketing/db-error';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    caption?: string;
    status?: PostStatus;
    scheduled_at?: string | null;
    media_urls?: string[];
    frames?: Record<string, unknown>[];
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.caption !== undefined) updates.caption = body.caption.trim();
  if (body.status !== undefined) updates.status = body.status;
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;
  if (body.media_urls !== undefined) updates.media_urls = body.media_urls;
  if (body.frames !== undefined) updates.frames = body.frames;

  const { data, error } = await ctx.supabase
    .from('marketing_posts')
    .update(updates)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select()
    .single();

  if (error) return dbErrorResponse('post', error);
  if (!data) return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 });
  return NextResponse.json({ post: data as MarketingPost });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const { error } = await ctx.supabase
    .from('marketing_posts')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId);

  if (error) return dbErrorResponse('post', error);
  return NextResponse.json({ success: true });
}
