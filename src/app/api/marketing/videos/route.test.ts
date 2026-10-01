import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), insert: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

const supabase = {
  from: () => ({
    insert: (row: unknown) => {
      mocks.insert(row);
      return { select: () => ({ single: async () => ({ data: { id: 'v-1', ...(row as object) }, error: null }) }) };
    },
  }),
};

const req = (body: unknown) =>
  new Request('http://localhost/api/marketing/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'user-1', supabase });
});

describe('POST /api/marketing/videos', () => {
  it('inserts a pending video job', async () => {
    const res = await POST(req({ prompt: 'Promo', imagePaths: ['account-acc-1/uploads/1-a.jpg'], tone: 'polished' }));
    expect(res.status).toBe(201);
    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(mocks.insert).toHaveBeenCalledWith({
      account_id: 'acc-1', created_by: 'user-1', prompt: 'Promo',
      image_paths: ['account-acc-1/uploads/1-a.jpg'], format: 'vertical', tone: 'polished', status: 'pending',
    });
  });
  it('400s on invalid input', async () => {
    expect((await POST(req({ prompt: '' }))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
