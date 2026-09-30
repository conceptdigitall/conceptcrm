import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), upsert: vi.fn(),
  column: null as null | { id: string; kind: string; options: string[] },
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { PATCH } from './route';

function ctx(accountId = 'acc-1') {
  return {
    accountId,
    userId: 'user-1',
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.column, error: null }) }) }),
        upsert: (row: unknown, opts: unknown) => {
          mocks.upsert(row, opts);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
      }),
    },
  };
}

const params = { params: Promise.resolve({ id: 'col-1', leadId: 'lead-1' }) };
const req = (body: unknown) =>
  new Request('http://localhost/api/prospecting/columns/col-1/values/lead-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.upsert.mockReset();
  mocks.column = { id: 'col-1', kind: 'choice', options: ['saúde', 'beleza'] };
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('PATCH /api/prospecting/columns/:id/values/:leadId', () => {
  it('stores the correction in its canonical spelling', async () => {
    const res = await PATCH(req({ value: 'BELEZA' }), params);
    expect(res.status).toBe(200);
    const [row, opts] = mocks.upsert.mock.calls[0];
    expect(row).toMatchObject({
      column_id: 'col-1', lead_id: 'lead-1', account_id: 'acc-1', corrected_value: 'beleza', corrected_by: 'user-1',
    });
    expect(row.corrected_at).toEqual(expect.any(String));
    expect(opts).toEqual({ onConflict: 'column_id,lead_id' });
  });
  it('accepts "nao" for a yes/no column', async () => {
    mocks.column = { id: 'col-1', kind: 'noul', options: [] };
    await PATCH(req({ value: 'nao' }), params);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ corrected_value: 'não' });
  });
  it('null clears the correction', async () => {
    await PATCH(req({ value: null }), params);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ corrected_value: null, corrected_by: null, corrected_at: null });
  });
  it('refuses a value outside the column options', async () => {
    const res = await PATCH(req({ value: 'esporte' }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Valor inválido. Use: saúde, beleza' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('404s for an unknown column', async () => {
    mocks.column = null;
    expect((await PATCH(req({ value: 'beleza' }), params)).status).toBe(404);
  });
});
