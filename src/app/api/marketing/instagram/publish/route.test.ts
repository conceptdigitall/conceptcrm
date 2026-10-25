import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  publish: vi.fn(),
  post: null as unknown,
  filters: [] as [string, unknown][],
  creds: null as null | { accessToken: string; igUserId: string },
  recordError: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 401 })),
}));
vi.mock('@/lib/marketing/instagram', () => ({
  publishToInstagram: mocks.publish,
  InstagramApiError: class extends Error {},
}));
vi.mock('@/lib/marketing/post-art-store', () => ({ loadArtSettings: vi.fn(), storePostArt: vi.fn() }));
vi.mock('@/lib/ai/admin-client', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/marketing/instagram-connection', () => ({
  loadInstagramCredentials: vi.fn(async () => mocks.creds),
  recordInstagramError: mocks.recordError,
}));

import { POST } from './route';

function supabase() {
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      mocks.filters.push([col, val]);
      return chain;
    },
    maybeSingle: async () => ({ data: mocks.post, error: null }),
    update: () => chain,
  };
  return { from: () => chain };
}

const req = (body: unknown) =>
  new Request('http://localhost/api/marketing/instagram/publish', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  mocks.filters = [];
  mocks.publish.mockReset();
  mocks.creds = null;
  mocks.post = { id: 'p-1', account_id: 'acc-1', kind: 'feed', media_type: 'foto', media_urls: ['https://x/a.jpg'], caption: 'Oi', status: 'scheduled' };
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'u', supabase: supabase() });
});

describe('POST /api/marketing/instagram/publish', () => {
  it('conta de cliente publica com o token dela, nunca com o do ambiente', async () => {
    mocks.creds = { accessToken: 'tok-cliente', igUserId: '1784100000001' };
    mocks.requireRole.mockResolvedValue({ accountId: 'acc-cliente', userId: 'u', supabase: supabase() });
    mocks.publish.mockResolvedValue({ mediaId: 'm-1', publishedAt: '2026-10-25T12:00:00Z' });
    const res = await POST(req({ postId: 'p-1' }));
    expect(res.status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok-cliente', igUserId: '1784100000001' }),
    );
  });

  it('conta interna sem conexão usa o token do ambiente', async () => {
    mocks.publish.mockResolvedValue({ mediaId: 'm-1', publishedAt: '2026-10-25T12:00:00Z' });
    await POST(req({ postId: 'p-1' }));
    const args = mocks.publish.mock.calls[0][0];
    expect(args).not.toHaveProperty('accessToken');
    expect(args).not.toHaveProperty('igUserId');
  });

  it('bloqueia conta de cliente sem Instagram conectado (token do ambiente é o da Concept)', async () => {
    mocks.requireRole.mockResolvedValue({ accountId: 'acc-cliente', userId: 'u', supabase: supabase() });
    const res = await POST(req({ postId: 'p-1' }));
    expect(res.status).toBe(403);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('recusa mídia e legenda soltas no corpo, sem post salvo', async () => {
    const res = await POST(req({ mediaUrls: ['https://evil/x.jpg'], caption: 'spam' }));
    expect(res.status).toBe(400);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('publica o post da própria conta com a mídia do banco', async () => {
    mocks.publish.mockResolvedValue({ mediaId: 'm-1', publishedAt: '2026-10-25T12:00:00Z' });
    const res = await POST(req({ postId: 'p-1', mediaUrls: ['https://evil/x.jpg'] }));
    expect(res.status).toBe(200);
    expect(mocks.filters).toContainEqual(['account_id', 'acc-1']);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrls: ['https://x/a.jpg'], caption: 'Oi' }),
    );
  });
});
