import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketingPost } from '@/types';
import { attachPostMedia } from './post-media';

function fakeDb(videos: Record<string, unknown>[]) {
  const createSignedUrls = vi.fn(async (paths: string[]) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `https://cdn/${p}?token=t` })),
  }));
  const db = {
    from: () => ({ select: () => ({ in: async () => ({ data: videos }) }) }),
    storage: { from: () => ({ createSignedUrls }) },
  } as unknown as SupabaseClient;
  return { db, createSignedUrls };
}

const post = (p: Partial<MarketingPost>) => ({ media_urls: [], ...p }) as MarketingPost;

describe('attachPostMedia', () => {
  it('foto usa a arte, vídeo usa o mp4, só quando pronto', async () => {
    const { db } = fakeDb([
      { id: 'v1', account_id: 'a', status: 'done', video_path: 'a/v1.mp4', poster_path: 'a/v1.jpg' },
      { id: 'v2', account_id: 'a', status: 'done', video_path: 'a/v2.mp4', poster_path: 'a/v2.jpg' },
      { id: 'v3', account_id: 'a', status: 'running', video_path: null, poster_path: null },
    ]);
    const out = await attachPostMedia(db, [
      post({ id: 'p1', account_id: 'a', video_id: 'v1', media_type: 'foto' }),
      post({ id: 'p2', account_id: 'a', video_id: 'v2', media_type: 'video' }),
      post({ id: 'p3', account_id: 'a', video_id: 'v3', media_type: 'video' }),
    ]);
    expect(out.map((p) => p.media_urls)).toEqual([
      ['https://cdn/a/v1.jpg?token=t'], ['https://cdn/a/v2.mp4?token=t'], [],
    ]);
  });
  it('não mexe em post com URL própria nem consulta o banco à toa', async () => {
    const { db, createSignedUrls } = fakeDb([]);
    const p = post({ id: 'p', media_urls: ['https://x/y.jpg'], video_id: null });
    expect(await attachPostMedia(db, [p])).toEqual([p]);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
  it('não assina vídeo de outra conta (video_id apontando para fora)', async () => {
    const { db, createSignedUrls } = fakeDb([
      { id: 'v9', account_id: 'outra', status: 'done', video_path: 'account-outra/v9.mp4', poster_path: 'account-outra/v9.jpg' },
    ]);
    const p = post({ id: 'p', account_id: 'a', video_id: 'v9', media_type: 'video' });
    expect(await attachPostMedia(db, [p])).toEqual([p]);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});
