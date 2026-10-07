import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  video: null as unknown,
  sign: vi.fn(),
  signResult: { data: { signedUrl: 'https://storage.example/v.mp4?token=t' }, error: null } as unknown,
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { GET } from './route';

function supabase() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.video, error: null }) }) }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expires: number, opts: unknown) => {
          mocks.sign(bucket, path, expires, opts);
          return mocks.signResult;
        },
      }),
    },
  };
}

const params = { params: Promise.resolve({ id: 'v-1' }) };
const req = () => new Request('http://localhost/api/marketing/videos/v-1/download');

beforeEach(() => {
  mocks.video = {
    id: 'v-1', status: 'done', prompt: 'Promo corte', created_at: '2026-10-01T15:00:00Z',
    video_path: 'account-acc-1/videos/v-1.mp4',
  };
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'u', supabase: supabase() });
});

describe('GET video download', () => {
  it('redirects to a short-lived signed URL that forces a download with a readable name', async () => {
    const res = await GET(req(), params);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://storage.example/v.mp4?token=t');
    expect(mocks.requireRole).toHaveBeenCalledWith('viewer');
    expect(mocks.sign).toHaveBeenCalledWith(
      'marketing', 'account-acc-1/videos/v-1.mp4', 60, { download: 'video-promo-corte-2026-10-01.mp4' },
    );
  });
  it('404s when the video is not visible to this account', async () => {
    mocks.video = null;
    expect((await GET(req(), params)).status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('409s while the video is not ready', async () => {
    mocks.video = { ...(mocks.video as object), status: 'running', video_path: null };
    expect((await GET(req(), params)).status).toBe(409);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('500s when storage cannot sign the file', async () => {
    mocks.signResult = { data: null, error: { message: 'Object not found' } };
    const res = await GET(req(), params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Não foi possível gerar o link do vídeo' });
    mocks.signResult = { data: { signedUrl: 'https://storage.example/v.mp4?token=t' }, error: null };
  });
  it('403s for an account that is not internal', async () => {
    mocks.requireRole.mockResolvedValue({ accountId: 'outsider', userId: 'u', supabase: supabase() });
    expect((await GET(req(), params)).status).toBe(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
