// Espelha no navegador as regras que a API aplica (queue-templated.ts), para o
// botão "Gerar" só liberar quando o pedido vai ser aceito.
import { DAILY_VIDEO_LIMIT } from '@/lib/marketing/limits';
import { findButton } from '@/lib/marketing/packs';
import { validatePhotoCount, type Pack } from '@/lib/marketing/packs/types';
import { MARKETING_TEMPLATES } from '@/lib/marketing/templates';

export interface PackFormInput {
  pack: Pack;
  buttonId: string;
  fields: Record<string, string | undefined>;
  fileCount: number;
  formats: Array<'vertical' | 'square'>;
  videosToday: number;
}

export function packFormState(input: PackFormInput): { ok: boolean; reason: string | null } {
  const found = findButton(input.pack, input.buttonId);
  if (!found) return { ok: false, reason: 'Escolha um modelo de vídeo' };

  const form = MARKETING_TEMPLATES.find((t) => t.id === found.button.formId);
  for (const f of form?.fields ?? []) {
    if (f.required && !input.fields[f.id]?.trim()) return { ok: false, reason: `Preencha: ${f.label}` };
  }

  const countError = validatePhotoCount(found.spec, input.fileCount);
  if (countError) return { ok: false, reason: `Este modelo pede: ${countError}` };

  if (input.formats.length === 0) return { ok: false, reason: 'Escolha 9:16 e/ou 1:1' };

  if (input.videosToday + input.formats.length > DAILY_VIDEO_LIMIT) {
    return { ok: false, reason: `Limite de ${DAILY_VIDEO_LIMIT} vídeos por dia atingido` };
  }
  return { ok: true, reason: null };
}
