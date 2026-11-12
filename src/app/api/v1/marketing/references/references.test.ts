// Referências pela API v1: o Hermes manda o link viral e lê a análise do worker.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordingDb, type RecordedOp } from '@/lib/api/v1/recording-db.test-utils';

const mocks = vi.hoisted(() => ({ requireApiKey: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ requireApiKey: mocks.requireApiKey }));

import * as references from './route';

const IG = 'https://www.instagram.com/reel/ABC123/';
const get = (qs = '') => new Request(`http://localhost/api/v1/marketing/references${qs}`);
const post = (body: unknown) =>
  new Request('http://localhost/api/v1/marketing/references', {
    method: 'POST',
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
    scopes: ['marketing:references'],
    createdBy: 'u-1',
  });
}

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'r-1',
  account_id: 'acc-1',
  url: IG,
  url_normalizada: 'instagram.com/reel/ABC123',
  plataforma: 'instagram',
  eixo: 'como_falar',
  nicho: null,
  views: 120000,
  arquivo_path: 'acc-1/r-1.mp4',
  status: 'pending',
  error: null,
  started_at: null,
  finished_at: null,
  analise: { gancho: 'x' },
  criado_por: null,
  created_at: '2026-11-06T10:00:00Z',
  updated_at: '2026-11-06T10:00:00Z',
  ...extra,
});

beforeEach(() => useAccount('acc-1'));

describe('access', () => {
  it('requires marketing:references on both methods', async () => {
    await references.GET(get());
    await references.POST(post({}));
    expect(mocks.requireApiKey).toHaveBeenNthCalledWith(1, expect.any(Request), 'marketing:references');
    expect(mocks.requireApiKey).toHaveBeenNthCalledWith(2, expect.any(Request), 'marketing:references');
  });

  it('403s without the scope', async () => {
    const { forbidden } = await import('@/lib/api/v1/respond');
    mocks.requireApiKey.mockRejectedValue(forbidden('API key lacks the required scope'));
    expect((await references.GET(get())).status).toBe(403);
    expect((await references.POST(post({ url: IG, eixo: 'como_falar' }))).status).toBe(403);
  });

  it('403s for a non-internal account even with the scope', async () => {
    useAccount('acc-outsider');
    expect((await references.GET(get())).status).toBe(403);
    expect((await references.POST(post({ url: IG, eixo: 'como_falar' }))).status).toBe(403);
    expect(ops).toHaveLength(0);
  });
});

describe('POST /api/v1/marketing/references', () => {
  it('creates a pending reference with no user (201)', async () => {
    useAccount('acc-1', () => ({ data: row() }));
    const res = await references.POST(post({ url: IG, eixo: 'como_falar', views: 120000 }));
    expect(res.status).toBe(201);
    const insert = ops.find((o) => o.action === 'insert');
    expect(insert?.payload).toMatchObject({ account_id: 'acc-1', status: 'pending', criado_por: null, views: 120000 });
    const body = await res.json();
    expect(body.data).toMatchObject({ id: 'r-1', plataforma: 'instagram', status: 'pending', analise: null });
    expect(body.data).not.toHaveProperty('account_id');
  });

  it('returns the existing one with duplicate: true (200)', async () => {
    useAccount('acc-1', (op) =>
      op.action === 'insert' ? { error: { code: '23505' } } : { data: row({ id: 'r-0' }) },
    );
    const res = await references.POST(post({ url: IG, eixo: 'como_falar' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(body.data.id).toBe('r-0');
    expect(ops[1].filters).toMatchObject({ account_id: 'acc-1', url_normalizada: 'https://www.instagram.com/reel/ABC123' });
  });

  it('400s on invalid input and on a string views', async () => {
    expect((await references.POST(post({ url: 'https://example.com/x', eixo: 'como_falar' }))).status).toBe(400);
    expect((await references.POST(post({ url: IG, eixo: 'como_falar', views: '10' }))).status).toBe(400);
    expect(ops).toHaveLength(0);
  });
});

describe('GET /api/v1/marketing/references', () => {
  it('400s on an unknown status', async () => {
    const res = await references.GET(get('?status=xyz'));
    expect(res.status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('filters by account and status', async () => {
    await references.GET(get('?status=done'));
    expect(ops[0].filters).toEqual({ account_id: 'acc-1', status: 'done' });
  });

  it('exposes analise only when done', async () => {
    useAccount('acc-1', () => ({
      data: [row({ id: 'a', status: 'done', finished_at: '2026-11-06T11:00:00Z' }), row({ id: 'b', status: 'running' })],
    }));
    const body = await (await references.GET(get())).json();
    expect(body.data[0]).toMatchObject({ id: 'a', analise: { gancho: 'x' } });
    expect(body.data[1]).toMatchObject({ id: 'b', analise: null });
  });
});
