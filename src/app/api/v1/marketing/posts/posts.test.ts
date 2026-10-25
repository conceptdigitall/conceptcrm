// Aprovação de posts pelo Hermes (Telegram): lista o que espera aprovação
// com o link da mídia e aprova/recusa só o que ainda está pendente.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordingDb, type RecordedOp } from '@/lib/api/v1/recording-db.test-utils';

const mocks = vi.hoisted(() => ({ requireApiKey: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ requireApiKey: mocks.requireApiKey }));

import * as posts from './route';
import * as post from './[id]/route';

const params = { params: Promise.resolve({ id: 'p-1' }) };
const get = (qs = '') => new Request(`http://localhost/api/v1/marketing/posts${qs}`);
const patch = (body: unknown) =>
  new Request('http://localhost/api/v1/marketing/posts/p-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

let ops: RecordedOp[];
function useAccount(accountId: string, reply: Parameters<typeof recordingDb>[0] = () => ({ data: [] })) {
  const fake = recordingDb(reply);
  ops = fake.ops;
  mocks.requireApiKey.mockResolvedValue({
    authType: 'api_key',
    supabase: fake.db,
    accountId,
    keyId: 'k-1',
    scopes: ['marketing:generate'],
    createdBy: 'u-1',
  });
}

const row = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'acc-1',
  kind: 'feed',
  media_type: 'video',
  title: 'Recepcionista 24h',
  idea: 'briefing',
  caption: 'Legenda #ia',
  status,
  video_id: 'v-1',
  media_urls: [],
  error_message: null,
  created_at: '2026-10-25T10:00:00Z',
  ...extra,
});

beforeEach(() => useAccount('acc-1'));

describe('GET /api/v1/marketing/posts', () => {
  it('requires marketing:generate and is internal only', async () => {
    useAccount('acc-outsider');
    const res = await posts.GET(get());
    expect(mocks.requireApiKey).toHaveBeenCalledWith(expect.any(Request), 'marketing:generate');
    expect(res.status).toBe(403);
    expect(ops).toHaveLength(0);
  });

  it('lists pending posts of the account with a signed media url', async () => {
    useAccount('acc-1', (op) =>
      op.table === 'marketing_videos'
        ? { data: [{ id: 'v-1', status: 'done', video_path: 'acc-1/v-1.mp4', poster_path: null }] }
        : { data: [row('pending_approval')] }
    );
    const res = await posts.GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      expect.objectContaining({ id: 'p-1', status: 'pending_approval', media_url: 'https://signed.example/acc-1/v-1.mp4' }),
    ]);
    expect(body.data[0]).not.toHaveProperty('account_id');
    expect(ops[0].filters).toEqual({ account_id: 'acc-1', status: 'pending_approval' });
  });

  it('400s on an unknown status filter', async () => {
    expect((await posts.GET(get('?status=tudo'))).status).toBe(400);
    expect(ops).toHaveLength(0);
  });
});

describe('PATCH /api/v1/marketing/posts/:id', () => {
  it('400s without a valid decision and never writes', async () => {
    expect((await post.PATCH(patch({ decision: 'publicar' }), params)).status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('approve moves a pending post to scheduled', async () => {
    useAccount('acc-1', () => ({ data: row('scheduled') }));
    const res = await post.PATCH(patch({ decision: 'approve' }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 'p-1', status: 'scheduled' });
    const update = ops.find((o) => o.action === 'update');
    expect(update?.payload).toEqual({ status: 'scheduled', error_message: null });
    expect(update?.filters).toEqual({ id: 'p-1', account_id: 'acc-1', status: 'pending_approval' });
  });

  it('reject archives with the reason', async () => {
    useAccount('acc-1', () => ({ data: row('archived') }));
    await post.PATCH(patch({ decision: 'reject', reason: 'tema repetido' }), params);
    const update = ops.find((o) => o.action === 'update');
    expect(update?.payload).toEqual({ status: 'archived', error_message: 'Recusado na aprovação: tema repetido' });
  });

  it('409s when the post is no longer pending', async () => {
    useAccount('acc-1', (op) => (op.action === 'update' ? { data: null } : { data: { status: 'scheduled' } }));
    const res = await post.PATCH(patch({ decision: 'approve' }), params);
    expect(res.status).toBe(409);
  });

  it('404s for a post outside the account', async () => {
    useAccount('acc-1', () => ({ data: null }));
    expect((await post.PATCH(patch({ decision: 'reject' }), params)).status).toBe(404);
  });

  it('hides DB error text on 500', async () => {
    useAccount('acc-1', () => ({ error: { message: 'secret detail' } }));
    const res = await post.PATCH(patch({ decision: 'approve' }), params);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
