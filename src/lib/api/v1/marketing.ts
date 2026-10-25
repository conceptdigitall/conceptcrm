// ============================================================
// Public API — marketing videos. Internal to Concept Digital: the
// worker spends Concept's Anthropic credits, so only accounts in
// NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS may use these endpoints, on top of
// the `marketing:generate` scope.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { forbidden } from '@/lib/api/v1/respond';
import { isInternalAccount } from '@/lib/internal-accounts';
import { videoFileName } from '@/lib/marketing/download';
import type { MarketingPost, PostStatus } from '@/types';

const BUCKET = 'marketing';
/** Long enough to forward the file (e.g. to Telegram), short enough to not linger. */
export const DOWNLOAD_TTL_SECONDS = 60 * 60;

export const VIDEO_SELECT =
  'id, prompt, format, tone, status, error, video_path, created_at, started_at, finished_at';

export function assertInternalAccount(accountId: string): void {
  if (!isInternalAccount(accountId)) {
    throw forbidden('Marketing videos are internal to Concept Digital');
  }
}

export interface ApiVideo {
  id: string;
  prompt: string;
  format: string;
  tone: string;
  status: string;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  download_url: string | null;
}

export function serializeVideo(
  row: Record<string, unknown>,
  downloadUrl: string | null = null
): ApiVideo {
  return {
    id: row.id as string,
    prompt: row.prompt as string,
    format: row.format as string,
    tone: row.tone as string,
    status: row.status as string,
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
    started_at: (row.started_at as string | null) ?? null,
    finished_at: (row.finished_at as string | null) ?? null,
    download_url: downloadUrl,
  };
}

/** Signed download URL for a finished video, or null if not ready / signing failed. */
export async function signedDownloadUrl(
  db: SupabaseClient,
  row: Record<string, unknown>
): Promise<string | null> {
  if (row.status !== 'done' || typeof row.video_path !== 'string') return null;
  const { data } = await db.storage
    .from(BUCKET)
    .createSignedUrl(row.video_path, DOWNLOAD_TTL_SECONDS, {
      download: videoFileName(row.prompt as string, row.created_at as string),
    });
  return data?.signedUrl ?? null;
}

// ------------------------------------------------------------
// Posts — aprovação fora do painel (o Hermes manda no Telegram com
// Aprovar/Recusar). Aprovar não publica: o post vira `scheduled` e a
// publicação no Instagram segue pelo painel. Recusar arquiva com o motivo.
// ------------------------------------------------------------

export const POST_SELECT =
  'id, kind, media_type, title, caption, status, video_id, media_urls, error_message, created_at';

export const POST_STATUSES: readonly PostStatus[] = ['draft', 'pending_approval', 'scheduled', 'published', 'archived'];

export interface ApiPost {
  id: string;
  kind: string;
  media_type: string;
  title: string;
  caption: string;
  status: string;
  video_id: string | null;
  /** Mp4 (vídeo) ou arte (foto), link assinado por 1 hora; null se a mídia não está pronta. */
  media_url: string | null;
  error: string | null;
  created_at: string;
}

export function serializePost(p: MarketingPost): ApiPost {
  return {
    id: p.id,
    kind: p.kind,
    media_type: p.media_type,
    title: p.title,
    caption: p.caption,
    status: p.status,
    video_id: p.video_id ?? null,
    media_url: p.media_urls?.[0] ?? null,
    error: p.error_message ?? null,
    created_at: p.created_at,
  };
}

export type PostDecision = 'approve' | 'reject';

export function isPostDecision(value: unknown): value is PostDecision {
  return value === 'approve' || value === 'reject';
}

export function decisionPatch(decision: PostDecision, reason?: unknown): Record<string, unknown> {
  if (decision === 'approve') return { status: 'scheduled', error_message: null };
  const why = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
  return { status: 'archived', error_message: why ? `Recusado na aprovação: ${why}` : 'Recusado na aprovação' };
}
