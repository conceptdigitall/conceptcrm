// Passo 1 do upload de referência: valida e devolve uma URL assinada para o
// navegador enviar o vídeo direto ao Storage. O arquivo nunca passa pela
// função: na Vercel o corpo da requisição é limitado a ~4,5 MB e um reel pesa
// 10-100 MB. A linha só nasce em /upload/complete, depois do envio.
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { REFERENCE_UPLOAD_MAX_BYTES } from '@/lib/marketing/references';
import {
  REFERENCE_BUCKET,
  isPlatform,
  referenceFolder,
  safeExtension,
  validateUploadMeta,
} from '@/lib/marketing/reference-upload';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 });

  if (typeof body.fileType !== 'string' || !body.fileType.startsWith('video/')) {
    return NextResponse.json({ error: 'O arquivo precisa ser um vídeo.' }, { status: 400 });
  }
  if (typeof body.fileSize !== 'number' || !Number.isFinite(body.fileSize) || body.fileSize <= 0) {
    return NextResponse.json({ error: 'Tamanho do arquivo inválido.' }, { status: 400 });
  }
  if (body.fileSize > REFERENCE_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: 'O vídeo passa de 100 MB. Envie um menor.' }, { status: 400 });
  }
  if (!isPlatform(body.plataforma)) {
    return NextResponse.json({ error: 'Escolha a plataforma do vídeo (Instagram ou TikTok).' }, { status: 400 });
  }
  const meta = validateUploadMeta(body);
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });

  const id = crypto.randomUUID();
  const path = `${referenceFolder(ctx.accountId)}/${id}.${safeExtension(body.ext, body.fileType)}`;

  const { data, error } = await supabaseAdmin().storage.from(REFERENCE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[marketing/references] falha ao assinar upload:', error);
    return NextResponse.json({ error: 'Não foi possível preparar o envio. Tente de novo.' }, { status: 500 });
  }
  return NextResponse.json({ id, path, token: data.token, signedUrl: data.signedUrl });
}
