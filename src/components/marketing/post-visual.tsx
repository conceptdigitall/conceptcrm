'use client';

import type { MarketingPost } from '@/types';

// Mídia do post: foto/vídeo real quando existe; senão a arte gerada pelo
// servidor (a mesma que vai para o Instagram ao publicar).
export function PostVisual({
  post,
  controls = false,
  className,
}: {
  post: Pick<MarketingPost, 'id' | 'version' | 'media_type' | 'media_urls'>;
  controls?: boolean;
  className?: string;
}) {
  const url = post.media_urls?.[0];
  if (url && post.media_type === 'video') {
    return <video src={url} className={className} muted playsInline preload="metadata" controls={controls} />;
  }
  const src = url || `/api/marketing/posts/${post.id}/art?v=${post.version}`;
  // eslint-disable-next-line @next/next/no-img-element -- URL assinada ou rota dinâmica, sem otimização do Next.
  return <img src={src} alt="" className={className} loading="lazy" decoding="async" />;
}
