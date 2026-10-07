import type { VideoFormat } from '@/types';

export type VideoKind = 'reels' | 'resumo';

// Espelha a constraint marketing_videos_kind_format do banco (migration 048):
// Resumo é só para o site (16:9); Reels é para as redes (9:16 ou 1:1).
export function isKindFormatValid(kind: VideoKind, format: VideoFormat): boolean {
  if (kind === 'resumo') return format === 'landscape';
  return format === 'vertical' || format === 'square';
}
