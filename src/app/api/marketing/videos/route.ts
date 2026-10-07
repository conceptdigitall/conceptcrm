import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { getActivePack } from '@/lib/marketing/packs';
import { queueTemplatedVideos } from '@/lib/marketing/queue-templated';
import { queueVideo } from '@/lib/marketing/queue-video';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  // Vídeo por botão do pacote de nicho: um pedido por formato escolhido.
  if (body && typeof body === 'object' && typeof (body as { buttonId?: unknown }).buttonId === 'string') {
    const templated = await queueTemplatedVideos(ctx.supabase, ctx.accountId, ctx.userId, body, getActivePack());
    if (!templated.ok) return NextResponse.json({ error: templated.error }, { status: templated.status });
    return NextResponse.json({ videos: templated.videos }, { status: 201 });
  }

  const result = await queueVideo(ctx.supabase, ctx.accountId, ctx.userId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ video: result.video }, { status: 201 });
}
