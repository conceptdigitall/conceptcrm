import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { MarketingPost, PostKind, PostMediaType, PostStatus } from '@/types';
import { nextVersionNumber } from '@/lib/marketing/content';
import { attachPostMedia } from '@/lib/marketing/post-media';
import { dbErrorResponse } from '@/lib/marketing/db-error';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') as PostKind | null;
  const status = searchParams.get('status') as PostStatus | null;

  let query = ctx.supabase
    .from('marketing_posts')
    .select('*')
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (kind) query = query.eq('kind', kind);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return dbErrorResponse('posts', error);
  return NextResponse.json({ posts: await attachPostMedia(ctx.supabase, (data ?? []) as MarketingPost[]) });
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as {
    kind: PostKind;
    media_type: PostMediaType;
    title: string;
    idea?: string;
    caption?: string;
    media_urls?: string[];
    video_id?: string | null;
    frames?: Record<string, unknown>[];
    status?: PostStatus;
    scheduled_at?: string | null;
    parent_id?: string | null;
  } | null;

  if (!body || !body.kind || !body.title) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes (kind, title)' }, { status: 400 });
  }
  // parent_id entra num filtro `.or()` montado por texto: sem isso, dá pra
  // injetar condições no filtro do PostgREST.
  for (const field of ['parent_id', 'video_id'] as const) {
    const value = body[field];
    if (value != null && (typeof value !== 'string' || !UUID_RE.test(value))) {
      return NextResponse.json({ error: `${field} inválido` }, { status: 400 });
    }
  }

  let version = 1;
  if (body.parent_id) {
    const { data: siblings } = await ctx.supabase
      .from('marketing_posts')
      .select('version')
      .eq('account_id', ctx.accountId)
      .or(`id.eq.${body.parent_id},parent_id.eq.${body.parent_id}`);

    if (siblings && siblings.length > 0) {
      version = nextVersionNumber(siblings as { version: number }[]);
    }
  }

  const newPost = {
    account_id: ctx.accountId,
    created_by: ctx.userId,
    kind: body.kind,
    media_type: body.media_type || 'foto',
    title: body.title.trim(),
    idea: (body.idea || '').trim(),
    caption: (body.caption || '').trim(),
    media_urls: body.media_urls || [],
    video_id: body.video_id || null,
    frames: body.frames || [],
    status: body.status || 'draft',
    scheduled_at: body.scheduled_at || null,
    parent_id: body.parent_id || null,
    version,
  };

  const { data, error } = await ctx.supabase
    .from('marketing_posts')
    .insert(newPost)
    .select()
    .single();

  if (error) return dbErrorResponse('posts', error);
  return NextResponse.json({ post: data as MarketingPost }, { status: 201 });
}
