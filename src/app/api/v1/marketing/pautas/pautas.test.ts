// Pauta semanal pela API v1: o Leo lê a pauta da semana, abre uma nova e
// aprova/ajusta/recusa item a item, só enquanto o item espera aprovação.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { recordingDb, type RecordedOp } from '@/lib/api/v1/recording-db.test-utils';
import { semanaInicioISO } from '@/lib/marketing/pauta';

const mocks = vi.hoisted(() => ({ requireApiKey: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ requireApiKey: mocks.requireApiKey }));

import * as pautas from './route';
import * as item from './itens/[id]/route';

const params = { params: Promise.resolve({ id: 'i-1' }) };
const get = (qs = '') => new Request(`http://localhost/api/v1/marketing/pautas${qs}`);
const post = () => new Request('http://localhost/api/v1/marketing/pautas', { method: 'POST' });
const patch = (body: unknown) =>
  new Request('http://localhost/api/v1/marketing/pautas/itens/i-1', {
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

const pauta = (extra: Record<string, unknown> = {}) => ({
  id: 'pa-1',
  account_id: 'acc-1',
  semana_inicio: '2026-10-26',
  status: 'pending_approval',
  created_at: '2026-10-26T10:00:00Z',
  ...extra,
});
const itemRow = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'i-1',
  pauta_id: 'pa-1',
  account_id: 'acc-1',
  dia: '2026-10-27',
  formato: 'reel',
  tema: 'Recepcionista 24h',
  gancho: 'Seu WhatsApp dorme?',
  roteiro: 'cena 1\ncena 2',
  legenda_base: 'Legenda #ia',
  status,
  comentario: null,
  versao: 1,
  post_id: null,
  updated_at: '2026-10-26T10:00:00Z',
  ...extra,
});

beforeEach(() => useAccount('acc-1'));
afterEach(() => vi.useRealTimers());

describe('GET /api/v1/marketing/pautas', () => {
  it('requires marketing:generate and is internal only', async () => {
    useAccount('acc-outsider');
    const res = await pautas.GET(get());
    expect(mocks.requireApiKey).toHaveBeenCalledWith(expect.any(Request), 'marketing:generate');
    expect(res.status).toBe(403);
    expect(ops).toHaveLength(0);
  });

  it('returns data null when the week has no pauta', async () => {
    useAccount('acc-1', () => ({ data: null }));
    const res = await pautas.GET(get('?semana=2026-10-26'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null });
    expect(ops).toHaveLength(1);
  });

  it('defaults semana to the current Brasília week', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'));
    useAccount('acc-1', () => ({ data: null }));
    await pautas.GET(get());
    expect(ops[0].filters).toEqual({ account_id: 'acc-1', semana_inicio: semanaInicioISO(new Date()) });
    expect(semanaInicioISO(new Date())).toBe('2026-10-26');
  });

  it('returns the pauta with its items, without account_id', async () => {
    useAccount('acc-1', (op) =>
      op.table === 'marketing_pautas' ? { data: pauta() } : { data: [itemRow('pending_approval')] }
    );
    const res = await pautas.GET(get('?semana=2026-10-26'));
    const body = await res.json();
    expect(body.data).toMatchObject({ id: 'pa-1', semana_inicio: '2026-10-26', status: 'pending_approval' });
    expect(body.data.itens).toEqual([
      expect.objectContaining({ id: 'i-1', dia: '2026-10-27', formato: 'reel', status: 'pending_approval', versao: 1, post_id: null }),
    ]);
    expect(body.data.itens[0]).not.toHaveProperty('account_id');
    expect(ops[1].table).toBe('marketing_pauta_itens');
    expect(ops[1].filters).toEqual({ pauta_id: 'pa-1', account_id: 'acc-1' });
  });

  it('400s on a malformed semana', async () => {
    expect((await pautas.GET(get('?semana=amanha'))).status).toBe(400);
    expect(ops).toHaveLength(0);
  });
});

describe('POST /api/v1/marketing/pautas', () => {
  it('409s when the week already has a pauta', async () => {
    useAccount('acc-1', () => ({ data: { id: 'pa-1' } }));
    const res = await pautas.POST(post());
    expect(res.status).toBe(409);
    expect(ops.some((o) => o.action === 'insert')).toBe(false);
  });

  it('inserts a generating pauta for the current week', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'));
    useAccount('acc-1', (op) => (op.action === 'insert' ? { data: pauta({ status: 'gerando' }) } : { data: null }));
    const res = await pautas.POST(post());
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ status: 'gerando', itens: [] });
    const insert = ops.find((o) => o.action === 'insert');
    expect(insert?.payload).toEqual({ account_id: 'acc-1', semana_inicio: '2026-10-26', status: 'gerando' });
  });

  it('is internal only', async () => {
    useAccount('acc-outsider');
    expect((await pautas.POST(post())).status).toBe(403);
    expect(ops).toHaveLength(0);
  });
});

describe('PATCH /api/v1/marketing/pautas/itens/:id', () => {
  it('is internal only', async () => {
    useAccount('acc-outsider');
    expect((await item.PATCH(patch({ decision: 'approve' }), params)).status).toBe(403);
    expect(ops).toHaveLength(0);
  });

  it('400s on an invalid decision and never writes', async () => {
    expect((await item.PATCH(patch({ decision: 'publicar' }), params)).status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('400s on adjust without comment', async () => {
    expect((await item.PATCH(patch({ decision: 'adjust' }), params)).status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it('approve updates only a pending item and sets updated_at', async () => {
    useAccount('acc-1', () => ({ data: itemRow('aprovado') }));
    const res = await item.PATCH(patch({ decision: 'approve' }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 'i-1', status: 'aprovado' });
    const update = ops.find((o) => o.action === 'update');
    expect(update?.payload).toMatchObject({ status: 'aprovado', comentario: null, updated_at: expect.any(String) });
    expect(update?.filters).toEqual({ id: 'i-1', account_id: 'acc-1', status: 'pending_approval' });
  });

  it('adjust stores the comment', async () => {
    useAccount('acc-1', () => ({ data: itemRow('ajuste', { comentario: 'mais curto' }) }));
    await item.PATCH(patch({ decision: 'adjust', comment: 'mais curto' }), params);
    const update = ops.find((o) => o.action === 'update');
    expect(update?.payload).toMatchObject({ status: 'ajuste', comentario: 'mais curto' });
  });

  it('409s with the current status when the item is no longer pending', async () => {
    useAccount('acc-1', (op) => (op.action === 'update' ? { data: null } : { data: { status: 'aprovado' } }));
    const res = await item.PATCH(patch({ decision: 'reject' }), params);
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain('aprovado');
  });

  it('404s for an item outside the account', async () => {
    useAccount('acc-1', () => ({ data: null }));
    expect((await item.PATCH(patch({ decision: 'reject' }), params)).status).toBe(404);
  });

  it('hides DB error text on 500', async () => {
    useAccount('acc-1', () => ({ error: { message: 'secret detail' } }));
    const res = await item.PATCH(patch({ decision: 'approve' }), params);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
