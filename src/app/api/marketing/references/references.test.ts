// Rotas de referências: link, upload e "analisar de novo", sempre presas à conta.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordingDb, type RecordedOp } from '@/lib/api/v1/recording-db.test-utils';
import { ForbiddenError } from '@/lib/auth/account';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  requireRole: mocks.requireRole,
}));
// Limite pequeno só no teste: criar 100 MB de verdade deixaria a suíte lenta.
vi.mock('@/lib/marketing/references', async (orig) => ({
  ...(await orig<typeof import('@/lib/marketing/references')>()),
  REFERENCE_UPLOAD_MAX_BYTES: 10,
}));
vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: () => ({ storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) } }),
}));

import * as list from './route';
import * as upload from './upload/route';
import * as retry from './[id]/retry/route';

const IG = 'https://www.instagram.com/reel/ABC123/';
let ops: RecordedOp[];

function useAccount(reply: Parameters<typeof recordingDb>[0] = () => ({ data: [] })) {
  const fake = recordingDb(reply);
  ops = fake.ops;
  mocks.requireRole.mockResolvedValue({ supabase: fake.db, accountId: 'acc-1', userId: 'u-1', role: 'agent' });
}

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'r-1', account_id: 'acc-1', status: 'pending', url_normalizada: 'https://www.instagram.com/reel/ABC123', ...extra,
});
const postLink = (body: unknown) =>
  new Request('http://localhost/api/marketing/references', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
const postUpload = (file: File, extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.set('file', file);
  form.set('plataforma', 'tiktok');
  form.set('eixo', 'como_falar');
  form.set('nicho', '');
  form.set('views', '1200');
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return new Request('http://localhost/api/marketing/references/upload', { method: 'POST', body: form });
};
const video = () => new File(['x'], 'v.mp4', { type: 'video/mp4' });
const retryCtx = { params: Promise.resolve({ id: 'r-1' }) };
const retryReq = () => new Request('http://localhost/api/marketing/references/r-1/retry', { method: 'POST' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  useAccount();
});

describe('GET /api/marketing/references', () => {
  it('lists only the account rows and the current week playbook', async () => {
    useAccount((op) => (op.table === 'marketing_pautas' ? { data: { playbook: { x: 1 } } } : { data: [row()] }));
    const res = await list.GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.references).toHaveLength(1);
    expect(json.playbook).toEqual({ x: 1 });
    expect(ops.every((o) => o.filters.account_id === 'acc-1')).toBe(true);
  });

  it('returns playbook null without a pauta', async () => {
    useAccount((op) => (op.table === 'marketing_pautas' ? { data: null } : { data: [] }));
    expect((await (await list.GET()).json()).playbook).toBeNull();
  });
});

describe('POST /api/marketing/references', () => {
  it('creates a pending reference', async () => {
    useAccount(() => ({ data: row() }));
    const res = await list.POST(postLink({ url: IG, eixo: 'como_falar' }));
    expect(res.status).toBe(201);
    const insert = ops.find((o) => o.action === 'insert')!;
    expect(insert.payload).toMatchObject({
      account_id: 'acc-1', status: 'pending', criado_por: 'u-1', url_normalizada: 'https://www.instagram.com/reel/ABC123',
    });
  });

  it('returns the existing row on a duplicate', async () => {
    useAccount((op) => (op.action === 'insert' ? { error: { code: '23505' } } : { data: row({ id: 'old' }) }));
    const res = await list.POST(postLink({ url: IG, eixo: 'como_falar' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    expect(json.reference.id).toBe('old');
  });

  it('rejects a host outside the list', async () => {
    const res = await list.POST(postLink({ url: 'https://evil.com/reel/ABC', eixo: 'como_falar' }));
    expect(res.status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('forbids viewers', async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError('no'));
    expect((await list.POST(postLink({ url: IG, eixo: 'como_falar' }))).status).toBe(403);
  });
});

describe('POST /api/marketing/references/upload', () => {
  it('rejects non-video files', async () => {
    const res = await upload.POST(postUpload(new File(['x'], 'a.png', { type: 'image/png' })));
    expect(res.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects files above the size limit without touching Storage', async () => {
    const res = await upload.POST(postUpload(new File(['x'.repeat(11)], 'v.mp4', { type: 'video/mp4' })));
    expect(res.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects an unknown platform', async () => {
    expect((await upload.POST(postUpload(video(), { plataforma: 'youtube' }))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('stores the file and inserts upload:<id> with the form platform', async () => {
    useAccount(() => ({ data: row() }));
    const res = await upload.POST(postUpload(video()));
    expect(res.status).toBe(201);
    const path = mocks.upload.mock.calls[0][0] as string;
    expect(path).toMatch(/^account-acc-1\/referencias\/[0-9a-f-]{36}\.mp4$/);
    const payload = ops.find((o) => o.action === 'insert')!.payload as Record<string, unknown>;
    expect(payload).toMatchObject({ plataforma: 'tiktok', arquivo_path: path, views: 1200, nicho: null });
    expect(payload.url).toBe(`upload:${payload.id}`);
    expect(payload.url_normalizada).toBe(`upload:${payload.id}`);
  });

  it('removes the file when the insert fails', async () => {
    useAccount(() => ({ error: { code: 'XX' } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await upload.POST(postUpload(video()));
    expect(res.status).toBe(500);
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
  });
});

describe('POST /api/marketing/references/[id]/retry', () => {
  it('conflicts when the reference is not failed', async () => {
    useAccount(() => ({ data: row({ status: 'done' }) }));
    expect((await retry.POST(retryReq(), retryCtx)).status).toBe(409);
    expect(ops.some((o) => o.action === 'update')).toBe(false);
  });

  it('resets a failed reference, scoped to the account', async () => {
    useAccount((op) => ({ data: op.action === 'update' ? row() : row({ status: 'failed' }) }));
    const res = await retry.POST(retryReq(), retryCtx);
    expect(res.status).toBe(200);
    const update = ops.find((o) => o.action === 'update')!;
    expect(update.payload).toEqual({ status: 'pending', error: null, retry_after: null, started_at: null, finished_at: null });
    expect(update.filters.account_id).toBe('acc-1');
  });

  it('404s for another account row', async () => {
    useAccount(() => ({ data: null }));
    expect((await retry.POST(retryReq(), retryCtx)).status).toBe(404);
  });
});
