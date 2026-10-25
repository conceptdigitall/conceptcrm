import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { fetchInstagramProfile, InstagramApiError } from '@/lib/marketing/instagram';
import {
  ACCESS_TOKEN_RE,
  IG_USER_ID_RE,
  deleteInstagramConnection,
  getInstagramStatus,
  saveInstagramConnection,
} from '@/lib/marketing/instagram-connection';
import { dbErrorResponse } from '@/lib/marketing/db-error';

/**
 * GET /api/marketing/instagram/connection  (viewer+)
 * Se a conta tem Instagram conectado e qual @. O token nunca sai daqui.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }
  try {
    return NextResponse.json({ connection: await getInstagramStatus(supabaseAdmin(), ctx.accountId) });
  } catch (err) {
    return dbErrorResponse('instagram-connection', err);
  }
}

/**
 * PUT /api/marketing/instagram/connection  (admin+)
 * Body: { ig_user_id, access_token }. Confere na Meta antes de gravar:
 * o ID devolvido tem que ser o informado, senão o token é de outro perfil.
 */
export async function PUT(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('admin');
  } catch (err) {
    return toErrorResponse(err);
  }
  const limit = checkRateLimit(`ig-connect:${ctx.userId}`, RATE_LIMITS.adminAction);
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => null)) as { ig_user_id?: unknown; access_token?: unknown } | null;
  const igUserId = typeof body?.ig_user_id === 'string' ? body.ig_user_id.trim() : '';
  const accessToken = typeof body?.access_token === 'string' ? body.access_token.trim() : '';
  if (!IG_USER_ID_RE.test(igUserId)) {
    return NextResponse.json({ error: 'ID da conta do Instagram inválido (só números).' }, { status: 400 });
  }
  if (!ACCESS_TOKEN_RE.test(accessToken)) {
    return NextResponse.json({ error: 'Token de acesso inválido.' }, { status: 400 });
  }

  let username: string | null = null;
  try {
    const profile = await fetchInstagramProfile(accessToken, igUserId);
    if (profile.id !== igUserId) {
      return NextResponse.json({ error: 'Esse token não é da conta informada.' }, { status: 400 });
    }
    username = profile.username ?? null;
  } catch (err) {
    if (err instanceof InstagramApiError) {
      return NextResponse.json({ error: `A Meta recusou: ${err.message}` }, { status: 400 });
    }
    console.error('[instagram/connection] falha ao conferir na Meta:', err);
    return NextResponse.json({ error: 'Não foi possível conferir com a Meta. Tente de novo.' }, { status: 502 });
  }

  try {
    const admin = supabaseAdmin();
    await saveInstagramConnection(admin, {
      accountId: ctx.accountId,
      userId: ctx.userId,
      igUserId,
      username,
      accessToken,
    });
    return NextResponse.json({ connection: await getInstagramStatus(admin, ctx.accountId) });
  } catch (err) {
    return dbErrorResponse('instagram-connection', err);
  }
}

/** DELETE /api/marketing/instagram/connection  (admin+) — desconecta. */
export async function DELETE() {
  let ctx;
  try {
    ctx = await requireRole('admin');
  } catch (err) {
    return toErrorResponse(err);
  }
  try {
    await deleteInstagramConnection(supabaseAdmin(), ctx.accountId);
    return NextResponse.json({ connection: { connected: false, username: null, ig_user_id: null, last_error: null, updated_at: null } });
  } catch (err) {
    return dbErrorResponse('instagram-connection', err);
  }
}
