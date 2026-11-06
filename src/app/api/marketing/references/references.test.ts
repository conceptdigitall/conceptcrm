// Rotas de referências: link, upload e "analisar de novo", sempre presas à conta.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordingDb, type RecordedOp } from '@/lib/api/v1/recording-db.test-utils';
import { ForbiddenError } from '@/lib/auth/account';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  signUpload: vi.fn(),
  list: vi.fn(),
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
  supabaseAdmin: () => ({ storage: { from: () => ({ createSignedUploadUrl: mocks.signUpload, list: mocks.list, remove: mocks.remove }) } }),
}));

import * as list from './route';
import * as upload from './upload/route';
import * as complete from './upload/complete/route';
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
const retryCtx = { params: Promise.resolve({ id: 'r-1' }) };
const retryReq = () => new Request('http://localhost/api/marketing/references/r-1/retry', { method: 'POST' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signUpload.mockResolvedValue({ data: { token: 'tok', signedUrl: 'https://signed.example/up' }, error: null });
  mocks.list.mockResolvedValue({ data: [{ name: `${ID}.mp4` }], error: null });
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

const jsonReq = (url: string, body: unknown) =>
  new Request(`http://localhost/api/marketing/references/${url}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
const prepBody = (extra: Record<string, unknown> = {}) => ({
  plataforma: 'tiktok', eixo: 'como_falar', nicho: '', views: '1200', fileType: 'video/mp4', fileSize: 5, ext: 'mp4', ...extra,
});
const ID = '11111111-1111-4111-8111-111111111111';
const PATH = `account-acc-1/referencias/${ID}.mp4`;
const completeBody = (extra: Record<string, unknown> = {}) => ({
  id: ID, path: PATH, plataforma: 'tiktok', eixo: 'como_falar', nicho: '', views: '1200', ...extra,
});

describe('POST /api/marketing/references/upload', () => {
  it('rejects non-video types without touching Storage', async () => {
    const res = await upload.POST(jsonReq('upload', prepBody({ fileType: 'image/png' })));
    expect(res.status).toBe(400);
    expect(mocks.signUpload).not.toHaveBeenCalled();
  });

  it('rejects sizes above the limit without touching Storage', async () => {
    expect((await upload.POST(jsonReq('upload', prepBody({ fileSize: 11 })))).status).toBe(400);
    expect(mocks.signUpload).not.toHaveBeenCalled();
  });

  it('rejects an unknown platform', async () => {
    expect((await upload.POST(jsonReq('upload', prepBody({ plataforma: 'youtube' })))).status).toBe(400);
    expect(mocks.signUpload).not.toHaveBeenCalled();
  });

  it('returns a signed upload with a path built from account and generated id, without inserting', async () => {
    const res = await upload.POST(jsonReq('upload', prepBody({ ext: '../x/mp4' })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBe(`account-acc-1/referencias/${json.id}.mp4`);
    expect(json).toMatchObject({ token: 'tok', signedUrl: 'https://signed.example/up' });
    expect(mocks.signUpload).toHaveBeenCalledWith(json.path);
    expect(ops).toHaveLength(0);
  });

  it('forbids viewers', async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError('no'));
    expect((await upload.POST(jsonReq('upload', prepBody()))).status).toBe(403);
  });
});

describe('POST /api/marketing/references/upload/complete', () => {
  it('rejects a path from another account without inserting', async () => {
    const res = await complete.POST(
      jsonReq('upload/complete', completeBody({ path: `account-other/referencias/${ID}.mp4` })),
    );
    expect(res.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(ops).toHaveLength(0);
  });

  it('rejects a path that does not match the id', async () => {
    const res = await complete.POST(
      jsonReq('upload/complete', completeBody({ path: 'account-acc-1/referencias/outro.mp4' })),
    );
    expect(res.status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('400s when the object is missing', async () => {
    mocks.list.mockResolvedValue({ data: [], error: null });
    const res = await complete.POST(jsonReq('upload/complete', completeBody()));
    expect(res.status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('inserts upload:<id> with arquivo_path on the happy path', async () => {
    useAccount(() => ({ data: row() }));
    const res = await complete.POST(jsonReq('upload/complete', completeBody()));
    expect(res.status).toBe(201);
    expect(mocks.list).toHaveBeenCalledWith('account-acc-1/referencias', expect.objectContaining({ search: `${ID}.mp4` }));
    expect(ops.find((o) => o.action === 'insert')!.payload).toMatchObject({
      id: ID, account_id: 'acc-1', url: `upload:${ID}`, url_normalizada: `upload:${ID}`,
      plataforma: 'tiktok', arquivo_path: PATH, views: 1200, nicho: null, status: 'pending', criado_por: 'u-1',
    });
  });

  it('removes the object when the insert fails', async () => {
    useAccount(() => ({ error: { code: 'XX' } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await complete.POST(jsonReq('upload/complete', completeBody()));
    expect(res.status).toBe(500);
    expect(mocks.remove).toHaveBeenCalledWith([PATH]);
  });

  it('forbids viewers', async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError('no'));
    expect((await complete.POST(jsonReq('upload/complete', completeBody()))).status).toBe(403);
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

  it('forbids viewers', async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError('no'));
    expect((await retry.POST(retryReq(), retryCtx)).status).toBe(403);
  });
});
