import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { videoFileName } from '@/lib/marketing/download';

const BUCKET = 'marketing';
// Only long enough for the browser to follow the redirect.
const LINK_TTL_SECONDS = 60;

// `<a download>` is ignored for cross-origin URLs (Supabase Storage), so the
// browser just played the video. A signed URL with `download` makes Storage
// answer with Content-Disposition: attachment, which saves the file.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }
  const { id } = await params;

  // RLS hides other accounts' videos.
  const { data: video } = await ctx.supabase
    .from('marketing_videos')
    .select('id, status, prompt, created_at, video_path')
    .eq('id', id)
    .maybeSingle();
  if (!video) return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
  if (video.status !== 'done' || !video.video_path) {
    return NextResponse.json({ error: 'O vídeo ainda não está pronto' }, { status: 409 });
  }

  const { data, error } = await ctx.supabase.storage
    .from(BUCKET)
    .createSignedUrl(video.video_path, LINK_TTL_SECONDS, { download: videoFileName(video.prompt, video.created_at) });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Não foi possível gerar o link do vídeo' }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
