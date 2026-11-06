// Passo 2 do upload de referência: o vídeo já está no Storage (enviado pelo
// navegador com a URL assinada); aqui conferimos o arquivo e criamos a linha.
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import type { MarketingReference } from '@/types';
import { dbErrorResponse } from '@/lib/marketing/db-error';
import {
  REFERENCE_BUCKET,
  isPlatform,
  referenceFolder,
  validateUploadMeta,
} from '@/lib/marketing/reference-upload';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 });

  const { id, path } = body;
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 });
  }
  // Nunca confiar no caminho do cliente fora da pasta da própria conta.
  const folder = referenceFolder(ctx.accountId);
  const prefix = `${folder}/${id}.`;
  if (typeof path !== 'string' || !path.startsWith(prefix) || !/^[a-z0-9]{2,5}$/.test(path.slice(prefix.length))) {
    return NextResponse.json({ error: 'Caminho do arquivo inválido.' }, { status: 400 });
  }
  if (!isPlatform(body.plataforma)) {
    return NextResponse.json({ error: 'Escolha a plataforma do vídeo (Instagram ou TikTok).' }, { status: 400 });
  }
  const meta = validateUploadMeta(body);
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });

  const admin = supabaseAdmin();
  const fileName = path.slice(folder.length + 1);
  const { data: found, error: listErr } = await admin.storage
    .from(REFERENCE_BUCKET)
    .list(folder, { search: fileName, limit: 5 });
  if (listErr) {
    console.error('[marketing/references] falha ao conferir o arquivo:', listErr);
    return NextResponse.json({ error: 'Não foi possível conferir o arquivo. Tente de novo.' }, { status: 500 });
  }
  if (!found?.some((f) => f.name === fileName)) {
    return NextResponse.json({ error: 'Arquivo não encontrado. Envie o vídeo de novo.' }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from('marketing_references')
    .insert({
      id,
      account_id: ctx.accountId,
      url: `upload:${id}`,
      url_normalizada: `upload:${id}`,
      plataforma: body.plataforma,
      eixo: meta.value.eixo,
      nicho: meta.value.nicho,
      views: meta.value.views,
      arquivo_path: path,
      status: 'pending',
      criado_por: ctx.userId,
    })
    .select()
    .single();

  if (error) {
    // Repetir o "concluir" (duplo clique, retry) colide com a linha já criada:
    // o arquivo é dessa linha, então nunca pode ser apagado aqui.
    if ((error as { code?: string }).code === '23505') {
      const { data: existing, error: findErr } = await ctx.supabase
        .from('marketing_references')
        .select('*')
        .eq('id', id)
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      if (findErr) return dbErrorResponse('references', findErr);
      if (!existing) {
        return NextResponse.json({ error: 'Esta referência já existe. Atualize a lista.' }, { status: 409 });
      }
      return NextResponse.json({ reference: existing as MarketingReference, duplicate: true });
    }
    const { error: rmErr } = await admin.storage.from(REFERENCE_BUCKET).remove([path]);
    if (rmErr) console.error('[marketing/references] falha ao apagar o arquivo órfão:', path, rmErr);
    return dbErrorResponse('references', error);
  }
  return NextResponse.json({ reference: data as MarketingReference }, { status: 201 });
}
