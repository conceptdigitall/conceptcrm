import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }
  const { id } = await params;

  const { data: current } = await ctx.supabase
    .from('marketing_videos')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
  if (current.status !== 'failed') {
    return NextResponse.json({ error: 'Só dá pra tentar de novo um vídeo com erro' }, { status: 409 });
  }

  const { data, error } = await ctx.supabase
    .from('marketing_videos')
    .update({
      status: 'pending', error: null, started_at: null, finished_at: null,
      video_path: null, poster_path: null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data });
}
