// Contrato entre um template de vídeo (template.json) e o diretor (Claude):
// o diretor devolve só dados, e tudo aqui é validado antes de ir ao render.

export interface TemplateSpec {
  id: string;
  name: string;
  formats: Array<'vertical' | 'square'>;
  photos: { min: number; max: number; multipleOf?: number };
  texts: Record<string, { maxChars: number; required?: boolean }>;
}

export interface DirectorOutput {
  templateId: string;
  photoOrder: number[];
  texts: Record<string, string>;
  caption: string;
  hashtags: string[];
}

export const MAX_CAPTION_CHARS = 2200;
export const MAX_HASHTAGS = 15;

type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// Limites dos textos digitados pelo dono (e dos devolvidos pelo diretor).
export function validateFieldLimits(spec: TemplateSpec, texts: Record<string, string>): string[] {
  const errors: string[] = [];
  for (const [key, rule] of Object.entries(spec.texts)) {
    const value = (texts[key] ?? '').trim();
    if (rule.required && !value) errors.push(`${key} é obrigatório`);
    else if (value.length > rule.maxChars) errors.push(`${key} passa de ${rule.maxChars} caracteres`);
  }
  return errors;
}

export function validatePhotoCount(spec: TemplateSpec, photoCount: number): string | null {
  const { min, max, multipleOf } = spec.photos;
  if (photoCount < min || photoCount > max) return `use de ${min} a ${max} fotos (recebi ${photoCount})`;
  if (multipleOf && photoCount % multipleOf !== 0) return `use um número de fotos múltiplo de ${multipleOf}`;
  return null;
}

export function validateDirectorOutput(
  spec: TemplateSpec, photoCount: number, out: unknown,
): Result<DirectorOutput> {
  if (!out || typeof out !== 'object' || Array.isArray(out)) {
    return { ok: false, errors: ['a resposta precisa ser um objeto JSON'] };
  }
  const o = out as Record<string, unknown>;
  const errors: string[] = [];

  const countError = validatePhotoCount(spec, photoCount);
  if (countError) errors.push(countError);

  if (o.templateId !== spec.id) errors.push(`templateId deve ser "${spec.id}"`);

  const order = o.photoOrder;
  const isOrder = Array.isArray(order)
    && order.length === photoCount
    && new Set(order).size === photoCount
    && order.every((n) => Number.isInteger(n) && n >= 0 && n < photoCount);
  if (!isOrder) errors.push(`photoOrder deve ser uma permutação de 0 a ${photoCount - 1}`);

  const rawTexts = o.texts;
  const texts: Record<string, string> = {};
  if (!rawTexts || typeof rawTexts !== 'object' || Array.isArray(rawTexts)) {
    errors.push('texts deve ser um objeto');
  } else {
    for (const [k, v] of Object.entries(rawTexts as Record<string, unknown>)) {
      if (!(k in spec.texts)) errors.push(`texto "${k}" não existe neste template`);
      else if (typeof v !== 'string') errors.push(`texto "${k}" deve ser string`);
      else texts[k] = v;
    }
    errors.push(...validateFieldLimits(spec, texts));
  }

  const caption = typeof o.caption === 'string' ? o.caption.trim() : '';
  if (!caption) errors.push('caption não pode ser vazia');
  else if (caption.length > MAX_CAPTION_CHARS) errors.push(`caption passa de ${MAX_CAPTION_CHARS} caracteres`);

  const hashtags = o.hashtags;
  if (!Array.isArray(hashtags) || !hashtags.every((h) => typeof h === 'string')) {
    errors.push('hashtags deve ser uma lista de textos');
  } else if (hashtags.length > MAX_HASHTAGS) {
    errors.push(`no máximo ${MAX_HASHTAGS} hashtags`);
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      templateId: spec.id,
      photoOrder: order as number[],
      texts,
      caption,
      hashtags: hashtags as string[],
    },
  };
}
