import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), current: null as null | Record<string, unknown>, update: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));
vi.mock('@/lib/internal-accounts', () => ({ isInternalAccount: (id: string) => id === 'acc-1' }));

import { POST } from './route';

function ctx(accountId = 'acc-1') {
  return {
    accountId,
    userId: 'user-1',
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.current, error: null }) }) }),
        update: (patch: unknown) => {
          mocks.update(patch);
          return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'col-1', ...(patch as object) }, error: null }) }) }) };
        },
      }),
    },
  };
}

const params = { params: Promise.resolve({ id: 'col-1' }) };
const req = new Request('http://localhost/api/prospecting/columns/col-1/teach', { method: 'POST' });

beforeEach(() => {
  mocks.update.mockReset();
  mocks.current = null;
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('POST /api/prospecting/columns/:id/teach', () => {
  it('asks the worker to teach a done column and puts it back in the queue', async () => {
    mocks.current = { id: 'col-1', status: 'done', teach_requested_at: null, taught_at: null };
    const res = await POST(req, params);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ teach_requested_at: expect.any(String), status: 'pending' }));
  });
  it('only flags a running column (the worker teaches when it finishes)', async () => {
    mocks.current = { id: 'col-1', status: 'running', teach_requested_at: null, taught_at: null };
    await POST(req, params);
    expect(mocks.update).toHaveBeenCalledWith({ teach_requested_at: expect.any(String) });
  });
  it('teaches each column only once', async () => {
    mocks.current = { id: 'col-1', status: 'done', teach_requested_at: '2026-10-01', taught_at: null };
    expect((await POST(req, params)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('404s for an unknown column', async () => {
    expect((await POST(req, params)).status).toBe(404);
  });
  it('403s outside the internal accounts', async () => {
    mocks.requireRole.mockResolvedValue(ctx('acc-x'));
    expect((await POST(req, params)).status).toBe(403);
  });
});
