import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  publish: vi.fn(),
  post: null as unknown,
  filters: [] as [string, unknown][],
  creds: null as null | { accessToken: string; igUserId: string },
  recordError: vi.fn(),
  claimed: true,
  claimPatch: null as Record<string, unknown> | null,
  adminUpdates: [] as Record<string, unknown>[],
  afterTasks: [] as Array<() => Promise<unknown>>,
  getRow: null as unknown,
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (task: () => Promise<unknown>) => mocks.afterTasks.push(task),
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
vi.mock('@/lib/marketing/post-media', () => ({ attachPostMedia: vi.fn(async (_s: unknown, posts: unknown[]) => posts) }));
vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: () => {
      const chain = {
        update: (patch: Record<string, unknown>) => {
          mocks.adminUpdates.push(patch);
          return chain;
        },
        eq: () => chain,
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    },
  })),
}));
vi.mock('@/lib/marketing/instagram-connection', () => ({
  loadInstagramCredentials: vi.fn(async () => mocks.creds),
  recordInstagramError: mocks.recordError,
}));

import { GET, POST } from './route';

function supabase() {
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      mocks.filters.push([col, val]);
      return chain;
    },
    neq: () => chain,
    or: () => chain,
    maybeSingle: async () => (mocks.claimPatch ? { data: mocks.claimed ? { id: 'p-1' } : null, error: null } : { data: mocks.getRow ?? mocks.post, error: null }),
    update: (patch: Record<string, unknown>) => {
      mocks.claimPatch = patch;
      return chain;
    },
  };
  return { from: () => chain };
}

const req = (body: unknown) =>
  new Request('http://localhost/api/marketing/instagram/publish', { method: 'POST', body: JSON.stringify(body) });

async function runBackground() {
  for (const task of mocks.afterTasks.splice(0)) await task();
}

beforeEach(() => {
  mocks.filters = [];
  mocks.publish.mockReset();
  mocks.recordError.mockReset();
  mocks.creds = null;
  mocks.claimed = true;
  mocks.claimPatch = null;
  mocks.adminUpdates = [];
  mocks.afterTasks = [];
  mocks.getRow = null;
  mocks.post = { id: 'p-1', account_id: 'acc-1', kind: 'feed', media_type: 'foto', media_urls: ['https://x/a.jpg'], caption: 'Oi', status: 'scheduled' };
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'u', supabase: supabase() });
});

describe('POST /api/marketing/instagram/publish', () => {
  it('responde 202 na hora e só fala com a Meta depois da resposta', async () => {
    mocks.publish.mockResolvedValue({ mediaId: 'm-1', publishedAt: '2026-10-25T12:00:00Z' });
    const res = await POST(req({ postId: 'p-1' }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'publishing', postId: 'p-1' });
    expect(mocks.claimPatch).toMatchObject({ status: 'publishing', error_message: null });
    expect(mocks.publish).not.toHaveBeenCalled();

    await runBackground();
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.adminUpdates.at(-1)).toMatchObject({ status: 'published', instagram_media_id: 'm-1' });
  });

  it('conta de cliente publica com o token dela, nunca com o do ambiente', async () => {
    mocks.creds = { accessToken: 'tok-cliente', igUserId: '1784100000001' };
    mocks.requireRole.mockResolvedValue({ accountId: 'acc-cliente', userId: 'u', supabase: supabase() });
    mocks.publish.mockResolvedValue({ mediaId: 'm-1', publishedAt: '2026-10-25T12:00:00Z' });
    const res = await POST(req({ postId: 'p-1' }));
    expect(res.status).toBe(202);
    await runBackground();
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok-cliente', igUserId: '1784100000001' }),
    );
  });

  it('conta interna sem conexão usa o token do ambiente', async () => {
    mocks.publish.mockResolvedValue({ mediaId: 'm-1', publishedAt: '2026-10-25T12:00:00Z' });
    await POST(req({ postId: 'p-1' }));
    await runBackground();
    const args = mocks.publish.mock.calls[0][0];
    expect(args).not.toHaveProperty('accessToken');
    expect(args).not.toHaveProperty('igUserId');
  });

  it('bloqueia conta de cliente sem Instagram conectado (token do ambiente é o da Concept)', async () => {
    mocks.requireRole.mockResolvedValue({ accountId: 'acc-cliente', userId: 'u', supabase: supabase() });
    const res = await POST(req({ postId: 'p-1' }));
    expect(res.status).toBe(403);
    expect(mocks.afterTasks).toHaveLength(0);
  });

  it('recusa mídia e legenda soltas no corpo, sem post salvo', async () => {
    const res = await POST(req({ mediaUrls: ['https://evil/x.jpg'], caption: 'spam' }));
    expect(res.status).toBe(400);
    expect(mocks.afterTasks).toHaveLength(0);
  });

  it('publica o post da própria conta com a mídia do banco', async () => {
    mocks.publish.mockResolvedValue({ mediaId: 'm-1', publishedAt: '2026-10-25T12:00:00Z' });
    const res = await POST(req({ postId: 'p-1', mediaUrls: ['https://evil/x.jpg'] }));
    expect(res.status).toBe(202);
    await runBackground();
    expect(mocks.filters).toContainEqual(['account_id', 'acc-1']);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrls: ['https://x/a.jpg'], caption: 'Oi' }),
    );
  });

  it('segundo clique com o post já reservado devolve 409 e não abre outro envio', async () => {
    mocks.claimed = false;
    const res = await POST(req({ postId: 'p-1' }));
    expect(res.status).toBe(409);
    expect(mocks.afterTasks).toHaveLength(0);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('vídeo sem arquivo é recusado antes de reservar o post', async () => {
    mocks.post = { id: 'p-1', account_id: 'acc-1', kind: 'feed', media_type: 'video', media_urls: [], status: 'pending_approval' };
    const res = await POST(req({ postId: 'p-1' }));
    expect(res.status).toBe(400);
    expect(mocks.claimPatch).toBeNull();
  });

  it('se a Meta recusar, devolve o post ao status de antes e guarda o motivo', async () => {
    mocks.post = { id: 'p-1', account_id: 'acc-1', kind: 'feed', media_type: 'foto', media_urls: ['https://x/a.jpg'], caption: 'Oi', status: 'pending_approval' };
    mocks.publish.mockRejectedValue(new Error('boom'));
    const res = await POST(req({ postId: 'p-1' }));
    expect(res.status).toBe(202);
    await runBackground();
    expect(mocks.adminUpdates.at(-1)).toMatchObject({
      status: 'pending_approval',
      error_message: 'Falha na publicação do Instagram',
      publish_started_at: null,
    });
  });
});

describe('GET /api/marketing/instagram/publish', () => {
  const get = (q: string) => GET(new Request(`http://localhost/api/marketing/instagram/publish${q}`));

  it('exige o post', async () => {
    expect((await get('')).status).toBe(400);
  });

  it('devolve o andamento do post da própria conta', async () => {
    mocks.getRow = {
      status: 'publishing',
      error_message: null,
      instagram_media_id: null,
      instagram_permalink: null,
      posted_at: null,
      publish_started_at: new Date().toISOString(),
    };
    const body = await (await get('?postId=p-1')).json();
    expect(body).toMatchObject({ status: 'publishing', stale: false });
    expect(mocks.filters).toContainEqual(['account_id', 'acc-1']);
  });

  it('avisa quando a publicação ficou presa (função caiu no meio)', async () => {
    mocks.getRow = {
      status: 'publishing',
      error_message: null,
      instagram_media_id: null,
      instagram_permalink: null,
      posted_at: null,
      publish_started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    expect((await (await get('?postId=p-1')).json()).stale).toBe(true);
  });
});
