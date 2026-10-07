import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordingDb, type RecordedOp } from '@/lib/api/v1/recording-db.test-utils';

const mocks = vi.hoisted(() => ({ requireApiKey: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ requireApiKey: mocks.requireApiKey }));

import { PATCH } from './route';

const params = { params: Promise.resolve({ id: 'cv-1' }) };
const patch = (body: unknown) =>
  new Request('http://localhost/api/v1/conversations/cv-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

let ops: RecordedOp[];
function useDb(reply: Parameters<typeof recordingDb>[0]) {
  const fake = recordingDb(reply);
  ops = fake.ops;
  mocks.requireApiKey.mockResolvedValue({
    authType: 'api_key',
    supabase: fake.db,
    accountId: 'acc-1',
    keyId: 'k-1',
    scopes: ['conversations:write'],
    createdBy: 'u-owner',
  });
}

const row = (paused: boolean) => ({
  id: 'cv-1',
  contact_id: 'c-1',
  status: 'open',
  ai_autoreply_disabled: paused,
  created_at: '2026-10-01',
  updated_at: '2026-10-06',
  contact: { id: 'c-1', phone: '+5533999990000', name: 'Pollyana', contact_tags: [] },
});

beforeEach(() => useDb(() => ({ data: row(true) })));

describe('PATCH /api/v1/conversations/:id', () => {
  it('requires the conversations:write scope', async () => {
    await PATCH(patch({ ai_paused: true }), params);
    expect(mocks.requireApiKey).toHaveBeenCalledWith(expect.any(Request), 'conversations:write');
  });

  it('400s without a boolean ai_paused and never writes', async () => {
    expect((await PATCH(patch({ ai_paused: 'sim' }), params)).status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('pauses, assigns to the key owner and returns ai_paused', async () => {
    const res = await PATCH(patch({ ai_paused: true, assign_to_me: true }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 'cv-1', ai_paused: true });
    const update = ops.find((o) => o.action === 'update');
    expect(update?.payload).toEqual({ ai_autoreply_disabled: true, assigned_agent_id: 'u-owner' });
    expect(update?.filters).toEqual({ id: 'cv-1', account_id: 'acc-1' });
  });

  it('404s for a conversation outside the account', async () => {
    useDb(() => ({ data: null }));
    const res = await PATCH(patch({ ai_paused: true }), params);
    expect(res.status).toBe(404);
  });

  it('hides DB error text on 500', async () => {
    useDb((op) => (op.action === 'update' ? { error: { message: 'secret detail' } } : { data: row(false) }));
    const res = await PATCH(patch({ ai_paused: false }), params);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
