import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), current: null as null | { id: string; status: string }, deleted: [] as unknown[], update: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { DELETE } from './route';
import { POST as RETRY } from './retry/route';

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
        delete: () => ({ eq: () => ({ select: async () => ({ data: mocks.deleted, error: null }) }) }),
      }),
    },
  };
}

const params = { params: Promise.resolve({ id: 'col-1' }) };
const req = new Request('http://localhost/api/prospecting/columns/col-1', { method: 'POST' });

beforeEach(() => {
  mocks.update.mockReset();
  mocks.current = null;
  mocks.deleted = [];
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('POST /api/prospecting/columns/:id/retry', () => {
  it('puts a failed column back in the queue', async () => {
    mocks.current = { id: 'col-1', status: 'failed' };
    const res = await RETRY(req, params);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ status: 'pending', error: null, started_at: null, finished_at: null });
  });
  it('409s for a column that did not fail', async () => {
    mocks.current = { id: 'col-1', status: 'done' };
    expect((await RETRY(req, params)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('404s for an unknown column', async () => {
    expect((await RETRY(req, params)).status).toBe(404);
  });
});

describe('DELETE /api/prospecting/columns/:id', () => {
  it('deletes the column', async () => {
    mocks.deleted = [{ id: 'col-1' }];
    const res = await DELETE(req, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it('404s when nothing was deleted', async () => {
    expect((await DELETE(req, params)).status).toBe(404);
  });
  it('403s for an account that is not internal', async () => {
    mocks.requireRole.mockResolvedValue(ctx('outsider'));
    expect((await DELETE(req, params)).status).toBe(403);
  });
});
