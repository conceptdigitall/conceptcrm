// Regras compartilhadas do upload de referência direto no Storage.
import { validateReferenceMeta } from '@/lib/marketing/references';

export const REFERENCE_BUCKET = 'marketing';

const EXT_RE = /^[a-z0-9]{2,5}$/;

/** Extensão segura (2-5 letras/números); cai em mp4 se não houver. */
export function safeExtension(ext: unknown, mime?: unknown): string {
  const fromExt = typeof ext === 'string' ? ext.replace(/^\./, '').toLowerCase() : '';
  if (EXT_RE.test(fromExt)) return fromExt;
  const fromType =
    typeof mime === 'string' ? mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '').toLowerCase() : '';
  return fromType && EXT_RE.test(fromType) ? fromType : 'mp4';
}

export function referenceFolder(accountId: string): string {
  return `account-${accountId}/referencias`;
}

export function isPlatform(v: unknown): v is 'instagram' | 'tiktok' {
  return v === 'instagram' || v === 'tiktok';
}

/** Valida eixo/nicho/views vindos em JSON; '' vira null e dígitos viram número. */
export function validateUploadMeta(body: Record<string, unknown>) {
  const nicho = typeof body.nicho === 'string' ? body.nicho.trim() : body.nicho;
  const views = typeof body.views === 'string' ? body.views.trim() : body.views;
  return validateReferenceMeta({
    eixo: body.eixo,
    nicho: nicho === '' || nicho === undefined ? null : nicho,
    views: views === '' || views === undefined ? null : typeof views === 'string' && /^\d+$/.test(views) ? Number(views) : views,
  });
}
