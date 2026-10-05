import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/deals/outcome-events', () => ({
  dispatchDealOutcome: vi.fn(async () => 'won'),
}));

import { dispatchDealOutcome } from '@/lib/deals/outcome-events';
import { recordingDb, type RecordedOp } from './recording-db.test-utils';
import { createDeal, dealErrorResponse, DealError, resolvePipelineStage, updateDeal } from './deals';

const PIPELINES = [
  {
    id: 'p-1',
    name: 'Vendas',
    created_at: '2026-01-01',
    stages: [
      { id: 's-2', name: 'Proposta', position: 1 },
      { id: 's-1', name: 'Novo', position: 0 },
    ],
  },
  { id: 'p-2', name: 'Pós-venda', created_at: '2026-02-01', stages: [{ id: 's-9', name: 'X', position: 0 }] },
];

const DEAL = {
  id: 'd-1',
  title: 'Site Koisa Nossa',
  value: 2500,
  status: 'open',
  pipeline_id: 'p-1',
  stage_id: 's-1',
  contact_id: 'c-1',
  created_at: '2026-10-05',
};

function db(extra: (op: RecordedOp) => { data?: unknown; error?: unknown } | undefined = () => undefined) {
  return recordingDb((op) => {
    const custom = extra(op);
    if (custom) return custom;
    if (op.table === 'pipelines') return { data: PIPELINES };
    if (op.table === 'deals' && op.action === 'select') return { data: DEAL };
    if (op.table === 'contacts') return { data: { id: 'c-1' } };
    if (op.table === 'accounts') return { data: { default_currency: 'BRL' } };
    return { data: { ...DEAL, ...(op.payload as object) } };
  });
}

describe('resolvePipelineStage', () => {
  it('defaults to the oldest pipeline and its first stage by position', async () => {
    const { db: d, ops } = db();
    expect(await resolvePipelineStage(d, 'acc-1', null, null)).toEqual({
      pipelineId: 'p-1',
      stageId: 's-1',
    });
    expect(ops[0].filters).toEqual({ account_id: 'acc-1' });
  });

  it('rejects a stage from another pipeline', async () => {
    const { db: d } = db();
    await expect(resolvePipelineStage(d, 'acc-1', 'p-1', 's-9')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects a pipeline of another account', async () => {
    const { db: d } = db();
    await expect(resolvePipelineStage(d, 'acc-1', 'p-foreign', null)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('createDeal', () => {
  it('requires title and contact', async () => {
    const { db: d } = db();
    await expect(createDeal(d, 'acc-1', 'u-1', { contact_id: 'c-1' })).rejects.toThrow('title');
    await expect(createDeal(d, 'acc-1', 'u-1', { title: 'X' })).rejects.toThrow('contact_id');
  });

  it('inserts open, in the account currency, scoped to the account', async () => {
    const { db: d, ops } = db();
    await createDeal(d, 'acc-1', 'u-1', { title: 'Site', contact_id: 'c-1', value: '1500' });
    const insert = ops.find((o) => o.table === 'deals' && o.action === 'insert');
    expect(insert?.payload).toMatchObject({
      account_id: 'acc-1',
      user_id: 'u-1',
      pipeline_id: 'p-1',
      stage_id: 's-1',
      value: 1500,
      currency: 'BRL',
      status: 'open',
    });
  });

  it('404s for a contact outside the account', async () => {
    const { db: d } = db((op) => (op.table === 'contacts' ? { data: null } : undefined));
    await expect(
      createDeal(d, 'acc-1', 'u-1', { title: 'Site', contact_id: 'c-x' })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('updateDeal', () => {
  beforeEach(() => vi.mocked(dispatchDealOutcome).mockClear());

  it('moves stage inside the same pipeline and scopes the update', async () => {
    const { db: d, ops } = db();
    await updateDeal(d, 'acc-1', 'd-1', { stage_id: 's-2' });
    const update = ops.find((o) => o.action === 'update');
    expect(update?.payload).toMatchObject({ stage_id: 's-2' });
    expect(update?.filters).toEqual({ id: 'd-1', account_id: 'acc-1' });
  });

  it('refuses a stage of another pipeline', async () => {
    const { db: d, ops } = db();
    await expect(updateDeal(d, 'acc-1', 'd-1', { stage_id: 's-9' })).rejects.toMatchObject({
      status: 404,
    });
    expect(ops.some((o) => o.action === 'update')).toBe(false);
  });

  it('fires the outcome webhook only on a transition to won/lost', async () => {
    const { db: d } = db();
    await updateDeal(d, 'acc-1', 'd-1', { status: 'won' });
    expect(dispatchDealOutcome).toHaveBeenCalledTimes(1);
    await updateDeal(d, 'acc-1', 'd-1', { notes: 'ok' });
    expect(dispatchDealOutcome).toHaveBeenCalledTimes(1);
  });

  it('still succeeds when the webhook throws', async () => {
    vi.mocked(dispatchDealOutcome).mockRejectedValueOnce(new Error('down'));
    const { db: d } = db();
    await expect(updateDeal(d, 'acc-1', 'd-1', { status: 'lost' })).resolves.toMatchObject({
      id: 'd-1',
    });
  });

  it('404s for a deal of another account', async () => {
    const { db: d } = db((op) =>
      op.table === 'deals' && op.action === 'select' ? { data: null } : undefined
    );
    await expect(updateDeal(d, 'acc-1', 'd-x', { status: 'won' })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('dealErrorResponse', () => {
  it('hides 5xx text', async () => {
    const res = dealErrorResponse(new DealError('relation deals does not exist', 500));
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});
