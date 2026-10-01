import type { VideoFormat, VideoTone } from '@/types';

const FORMATS: VideoFormat[] = ['vertical', 'square', 'landscape'];
const TONES: VideoTone[] = ['default', 'polished', 'app-store', 'cinematic'];

type Result =
  | { ok: true; value: { prompt: string; imagePaths: string[]; format: VideoFormat; tone: VideoTone } }
  | { ok: false; error: string };

export function validateVideoInput(body: unknown, accountId: string): Result {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corpo inválido' };
  const b = body as Record<string, unknown>;

  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (prompt.length > 1000) return { ok: false, error: 'Descrição muito longa (máx. 1000)' };

  const imagePaths = Array.isArray(b.imagePaths) ? b.imagePaths : [];
  // The owner may just upload photos; the description becomes optional then.
  if (!prompt && imagePaths.length === 0) {
    return { ok: false, error: 'Escreva uma descrição ou envie pelo menos 1 foto' };
  }
  if (imagePaths.length > 4) return { ok: false, error: 'No máximo 4 fotos' };
  const prefix = `account-${accountId}/uploads/`;
  for (const p of imagePaths) {
    if (typeof p !== 'string' || !p.startsWith(prefix) || p.includes('..')) {
      return { ok: false, error: 'Foto inválida' };
    }
  }

  const format = (b.format ?? 'vertical') as VideoFormat;
  if (!FORMATS.includes(format)) return { ok: false, error: 'Formato inválido' };
  const tone = (b.tone ?? 'default') as VideoTone;
  if (!TONES.includes(tone)) return { ok: false, error: 'Tom inválido' };

  return { ok: true, value: { prompt, imagePaths: imagePaths as string[], format, tone } };
}
