import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), insert: vi.fn(), count: 0 }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

function ctx(accountId = 'acc-1') {
  return {
    accountId,
    userId: 'user-1',
    supabase: {
      from: () => ({
        select: () => ({ eq: async () => ({ count: mocks.count, error: null }) }),
        insert: (row: unknown) => {
          mocks.insert(row);
          return { select: () => ({ single: async () => ({ data: { id: 'col-1', ...(row as object) }, error: null }) }) };
        },
      }),
    },
  };
}

const req = (body: unknown) =>
  new Request('http://localhost/api/prospecting/columns', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.count = 0;
  mocks.insert.mockReset();
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('POST /api/prospecting/columns', () => {
  it('parses the title and inserts a pending column', async () => {
    const res = await POST(req({ title: 'Nicho: saúde, beleza' }));
    expect(res.status).toBe(201);
    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(mocks.insert).toHaveBeenCalledWith({
      account_id: 'acc-1', created_by: 'user-1', title: 'Nicho: saúde, beleza',
      kind: 'choice', options: ['saúde', 'beleza'], instructions: 'Nicho', status: 'pending',
    });
  });
  it('returns 400 with the parser message on an invalid title', async () => {
    const res = await POST(req({ title: 'Nicho: saúde' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Use pelo menos 2 opções separadas por vírgula' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('refuses an 11th column', async () => {
    mocks.count = 10;
    const res = await POST(req({ title: 'Tem site?' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Limite de 10 colunas. Exclua uma para criar outra.' });
  });
  it('403s for an account that is not internal', async () => {
    mocks.requireRole.mockResolvedValue(ctx('outsider'));
    const res = await POST(req({ title: 'Tem site?' }));
    expect(res.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
