// Referência por arquivo: o vídeo vai para o bucket privado `marketing` e o
// worker analisa a partir de lá.
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import type { MarketingReference } from '@/types';
import { REFERENCE_UPLOAD_MAX_BYTES, validateReferenceMeta } from '@/lib/marketing/references';
import { dbErrorResponse } from '@/lib/marketing/db-error';

const BUCKET = 'marketing';

function fileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const fromType = file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return fromType || 'mp4';
}

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Envie um arquivo de vídeo.' }, { status: 400 });
  if (!file.type.startsWith('video/')) {
    return NextResponse.json({ error: 'O arquivo precisa ser um vídeo.' }, { status: 400 });
  }
  if (file.size > REFERENCE_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: 'O vídeo passa de 100 MB. Envie um menor.' }, { status: 400 });
  }

  const plataforma = field(form, 'plataforma');
  if (plataforma !== 'instagram' && plataforma !== 'tiktok') {
    return NextResponse.json({ error: 'Escolha a plataforma do vídeo (Instagram ou TikTok).' }, { status: 400 });
  }

  const viewsRaw = field(form, 'views');
  const meta = validateReferenceMeta({
    eixo: field(form, 'eixo'),
    nicho: field(form, 'nicho') || null,
    views: viewsRaw === '' ? null : /^\d+$/.test(viewsRaw) ? Number(viewsRaw) : viewsRaw,
  });
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });

  const id = crypto.randomUUID();
  const path = `account-${ctx.accountId}/referencias/${id}.${fileExtension(file)}`;
  const admin = supabaseAdmin();

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) {
    console.error('[marketing/references] falha no upload:', upErr);
    return NextResponse.json({ error: 'Não foi possível salvar o vídeo. Tente de novo.' }, { status: 500 });
  }

  const { data, error } = await ctx.supabase
    .from('marketing_references')
    .insert({
      id,
      account_id: ctx.accountId,
      url: `upload:${id}`,
      url_normalizada: `upload:${id}`,
      plataforma,
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
    await admin.storage.from(BUCKET).remove([path]);
    return dbErrorResponse('references', error);
  }
  return NextResponse.json({ reference: data as MarketingReference }, { status: 201 });
}
