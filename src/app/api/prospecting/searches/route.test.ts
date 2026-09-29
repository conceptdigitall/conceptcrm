import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), insert: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

function ctx() {
  return {
    accountId: 'acc-1',
    userId: 'user-1',
    supabase: {
      from: () => ({
        insert: (row: unknown) => {
          mocks.insert(row);
          return { select: () => ({ single: async () => ({ data: { id: 's-1', ...(row as object) }, error: null }) }) };
        },
      }),
    },
  };
}

const req = (body: unknown) =>
  new Request('http://localhost/api/prospecting/searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('POST /api/prospecting/searches', () => {
  it('requires agent and inserts a pending search', async () => {
    const res = await POST(req({ query: 'barbearia', location: 'Santos, SP', maxResults: 20 }));
    expect(res.status).toBe(201);
    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(mocks.insert).toHaveBeenCalledWith({
      account_id: 'acc-1',
      created_by: 'user-1',
      query: 'barbearia',
      location: 'Santos, SP',
      max_results: 20,
      status: 'pending',
    });
  });
  it('returns 400 on invalid input without inserting', async () => {
    const res = await POST(req({ query: '', location: 'Santos' }));
    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('returns the auth error when the role check fails', async () => {
    mocks.requireRole.mockRejectedValue(new Error('nope'));
    const res = await POST(req({ query: 'a', location: 'b' }));
    expect(res.status).toBe(403);
  });
});
