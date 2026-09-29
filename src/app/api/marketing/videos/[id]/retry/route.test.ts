import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), current: null as unknown, update: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

function supabase() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.current, error: null }) }) }),
      update: (patch: unknown) => {
        mocks.update(patch);
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { id: 'v-1', ...(patch as object) }, error: null }) }),
          }),
        };
      },
    }),
  };
}

const params = { params: Promise.resolve({ id: 'v-1' }) };
const req = () => new Request('http://localhost/api/marketing/videos/v-1/retry', { method: 'POST' });

beforeEach(() => {
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'u', supabase: supabase() });
});

describe('POST retry', () => {
  it('resets a failed search to pending', async () => {
    mocks.current = { id: 'v-1', status: 'failed' };
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      status: 'pending', error: null, started_at: null, finished_at: null,
      video_path: null, poster_path: null,
    });
  });
  it('404s when the search is not visible', async () => {
    mocks.current = null;
    expect((await POST(req(), params)).status).toBe(404);
  });
  it('409s when the search is not failed', async () => {
    mocks.current = { id: 'v-1', status: 'running' };
    expect((await POST(req(), params)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
