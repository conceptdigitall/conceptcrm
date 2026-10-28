'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { MarketingPost } from '@/types';
import { PublishTimeoutError, startPublish, waitForPublish } from '@/lib/marketing/publish-client';

/**
 * Publicação no Instagram sem travar a tela: dispara, acompanha o andamento e
 * retoma sozinho se a página foi recarregada com o post ainda em 'publishing'.
 */
export function usePostPublisher(
  post: MarketingPost | null,
  onUpdated: (post: MarketingPost) => void,
  messages: { success: string; fallback: string; extra?: Record<string, unknown> },
) {
  const [starting, setStarting] = useState(false);
  const tracking = useRef<string | null>(null);
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const follow = useCallback(async (current: MarketingPost) => {
    if (tracking.current === current.id) return;
    tracking.current = current.id;
    try {
      const result = await waitForPublish(current.id);
      if (result.status === 'published') {
        toast.success(messagesRef.current.success);
        onUpdatedRef.current({
          ...current,
          status: 'published',
          error_message: null,
          instagram_media_id: result.instagram_media_id,
          instagram_permalink: result.instagram_permalink,
          posted_at: result.posted_at,
        });
      } else {
        // Falhou na Meta (ou ficou presa): o post volta a poder ser publicado de novo.
        const status = result.status === 'publishing' ? 'pending_approval' : result.status;
        toast.error(result.error_message || 'A publicação não terminou. Tente de novo.');
        onUpdatedRef.current({ ...current, status, error_message: result.error_message });
      }
    } catch (err) {
      if (err instanceof PublishTimeoutError) toast.warning(err.message);
      else toast.error(err instanceof Error ? err.message : messagesRef.current.fallback);
    } finally {
      tracking.current = null;
    }
  }, []);

  const publish = useCallback(async () => {
    if (!post) return;
    setStarting(true);
    try {
      await startPublish(post.id, messagesRef.current.extra);
      const publishing = { ...post, status: 'publishing' as const, error_message: null };
      onUpdatedRef.current(publishing);
      void follow(publishing);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : messagesRef.current.fallback);
    } finally {
      setStarting(false);
    }
  }, [post, follow]);

  // Página recarregada (ou outra aba) com o post já em andamento: volta a acompanhar.
  useEffect(() => {
    if (post?.status === 'publishing') void follow(post);
  }, [post, follow]);

  return { publish, busy: starting || post?.status === 'publishing' };
}
