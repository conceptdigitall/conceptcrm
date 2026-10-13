// Enfileira vídeos de Reels feitos por um botão do pacote de nicho (uma linha
// por formato). O worker (Mac) renderiza; aqui só validamos e gravamos.
import type { SupabaseClient } from '@supabase/supabase-js';

import { DAILY_VIDEO_LIMIT, getStartOfTodayIso } from '@/lib/marketing/limits';
import { findButton } from '@/lib/marketing/packs';
import { validatePhotoCount, type Pack } from '@/lib/marketing/packs/types';
import { isKindFormatValid } from '@/lib/marketing/kinds';
import { MARKETING_TEMPLATES, composeTemplatePrompt } from '@/lib/marketing/templates';
import { validatePhotoPaths } from '@/lib/marketing/validate';
import type { VideoFormat } from '@/types';

export type QueueTemplatedResult =
  | { ok: true; videos: Record<string, unknown>[] }
  | { ok: false; status: 400 | 429 | 500; error: string };

const MAX_FIELD_CHARS = 200;
const bad = (error: string): QueueTemplatedResult => ({ ok: false, status: 400, error });

export async function queueTemplatedVideos(
  db: SupabaseClient,
  accountId: string,
  createdBy: string | null,
  body: unknown,
  pack: Pack | null,
): Promise<QueueTemplatedResult> {
  if (!pack) return bad('Nenhum pacote de vídeo está ligado neste CRM');
  if (!body || typeof body !== 'object') return bad('Corpo inválido');
  const b = body as Record<string, unknown>;

  const found = typeof b.buttonId === 'string' ? findButton(pack, b.buttonId) : null;
  if (!found) return bad('Modelo de vídeo inválido');
  const { button, spec } = found;

  // Campos do formulário guiado: obrigatórios presentes, todos texto, tamanho sensato.
  const rawFields = b.fields && typeof b.fields === 'object' ? (b.fields as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    if (typeof v !== 'string') return bad(`Campo "${k}" inválido`);
    if (v.trim().length > MAX_FIELD_CHARS) return bad(`O campo "${k}" passa de ${MAX_FIELD_CHARS} caracteres`);
    if (v.trim()) fields[k] = v.trim();
  }
  const form = MARKETING_TEMPLATES.find((t) => t.id === button.formId);
  for (const f of form?.fields ?? []) {
    if (f.required && !fields[f.id]) return bad(`Preencha: ${f.label}`);
  }

  const imagePaths = Array.isArray(b.imagePaths) ? (b.imagePaths as unknown[]) : [];
  const pathError = validatePhotoPaths(imagePaths, accountId);
  if (pathError) return bad(pathError);
  const countError = validatePhotoCount(spec, imagePaths.length);
  if (countError) return bad(`Este modelo pede: ${countError}`);

  const requested = Array.isArray(b.formats) ? (b.formats as unknown[]) : [];
  const formats = [...new Set(requested)] as VideoFormat[];
  if (
    formats.length === 0
    || !formats.every((f) => (f === 'vertical' || f === 'square') && spec.formats.includes(f) && isKindFormatValid('reels', f))
  ) {
    return bad('Escolha 9:16 e/ou 1:1');
  }

  const { count } = await db
    .from('marketing_videos')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', getStartOfTodayIso());
  if ((count ?? 0) + formats.length > DAILY_VIDEO_LIMIT) {
    return {
      ok: false,
      status: 429,
      error: `Limite diário de ${DAILY_VIDEO_LIMIT} vídeos atingido hoje. Tente novamente amanhã.`,
    };
  }

  const prompt = composeTemplatePrompt(button.formId, fields);
  const rows = formats.map((format) => ({
    account_id: accountId,
    created_by: createdBy,
    prompt,
    image_paths: imagePaths as string[],
    format,
    tone: pack.tone,
    status: 'pending',
    kind: 'reels',
    niche: pack.niche,
    template_id: button.templateId,
    director_input: { buttonId: button.id, fields },
  }));

  const { data, error } = await db.from('marketing_videos').insert(rows).select();
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? 'Falha ao criar vídeo' };
  return { ok: true, videos: data as Record<string, unknown>[] };
}
