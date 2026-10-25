import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  profile: vi.fn(),
  save: vi.fn(),
  status: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'forbidden' }, { status: 403 })),
}));
vi.mock('@/lib/ai/admin-client', () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock('@/lib/marketing/instagram', () => ({
  fetchInstagramProfile: mocks.profile,
  InstagramApiError: class extends Error {},
}));
vi.mock('@/lib/marketing/instagram-connection', async (orig) => ({
  ...(await orig<typeof import('@/lib/marketing/instagram-connection')>()),
  saveInstagramConnection: mocks.save,
  getInstagramStatus: mocks.status,
  deleteInstagramConnection: mocks.del,
}));

import { DELETE, GET, PUT } from './route';

const TOKEN = 'tok_teste_' + 'x'.repeat(30);
const put = (body: unknown) =>
  PUT(new Request('http://localhost/api/marketing/instagram/connection', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-9', userId: 'u-9' });
  mocks.status.mockResolvedValue({ connected: true, username: 'loja', ig_user_id: '1784100000001', last_error: null, updated_at: 'x' });
});

describe('PUT /api/marketing/instagram/connection', () => {
  it('exige admin', async () => {
    mocks.requireRole.mockRejectedValue(new Error('Insufficient role'));
    expect((await put({ ig_user_id: '1784100000001', access_token: TOKEN })).status).toBe(403);
    expect(mocks.requireRole).toHaveBeenCalledWith('admin');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('recusa ID e token mal formados sem chamar a Meta', async () => {
    expect((await put({ ig_user_id: '12 OR 1=1', access_token: TOKEN })).status).toBe(400);
    expect((await put({ ig_user_id: '1784100000001', access_token: 'curto' })).status).toBe(400);
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it('recusa token de outro perfil', async () => {
    mocks.profile.mockResolvedValue({ id: '999999999', username: 'outro' });
    expect((await put({ ig_user_id: '1784100000001', access_token: TOKEN })).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('grava na conta de quem chamou e não devolve o token', async () => {
    mocks.profile.mockResolvedValue({ id: '1784100000001', username: 'loja' });
    const res = await put({ ig_user_id: '1784100000001', access_token: TOKEN });
    expect(res.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accountId: 'acc-9', accessToken: TOKEN, username: 'loja' }));
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN);
  });
});

describe('GET e DELETE', () => {
  it('GET mostra só o status para qualquer membro', async () => {
    const res = await GET();
    expect(mocks.requireRole).toHaveBeenCalledWith('viewer');
    expect((await res.json()).connection).not.toHaveProperty('access_token');
  });

  it('DELETE exige admin e apaga só a conta de quem chamou', async () => {
    await DELETE();
    expect(mocks.requireRole).toHaveBeenCalledWith('admin');
    expect(mocks.del).toHaveBeenCalledWith(expect.anything(), 'acc-9');
  });
});
