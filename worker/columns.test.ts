import { describe, expect, it, vi } from 'vitest';
import type { LeadColumn } from '@/types';
import { BATCH_SIZE, requeueColumnsForAccount, runColumnJob, type LayaFn } from './columns';

type Row = Record<string, unknown>;

const column = {
  id: 'col-1', account_id: 'acc-1', title: 'Tem site?', kind: 'noul', options: [], status: 'running',
} as unknown as LeadColumn;

const lead = (i: number): Row => ({
  id: `l${i}`, account_id: 'acc-1', name: `Negócio ${i}`, category: 'Barbearia',
  rating: 4.5, review_count: 10, website: null, phone: null, is_mobile: false,
});

function fakeDb(opts: {
  leads: Row[];
  values?: Row[];
  upsertError?: (call: number) => { code?: string; message: string } | null;
}) {
  const calls = { upserts: [] as Row[][], updates: [] as Row[], filters: [] as [string, string, unknown][] };
  let upsertCall = 0;
  const db = {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query: any = {
        select: () => query,
        order: () => query,
        eq: (col: string, v: unknown) => { calls.filters.push([table, col, v]); return query; },
        limit: async () => ({ data: opts.leads, error: null }),
        then: (resolve: (r: unknown) => void) => resolve({ data: opts.values ?? [], error: null }),
        upsert: async (rows: Row[]) => {
          calls.upserts.push(rows);
          return { error: opts.upsertError?.(upsertCall++) ?? null };
        },
        update: (patch: Row) => {
          calls.updates.push({ table, ...patch });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chain: any = { eq: () => chain, then: (r: (v: unknown) => void) => r({ error: null }) };
          return chain;
        },
      };
      return query;
    },
  };
  return { db: db as never, calls };
}

const yes = () => vi.fn<LayaFn>(async (states) => states.map(() => ({ noul: 0.9 })));

describe('runColumnJob', () => {
  it('fills only leads without a value or correction, in batches of 32, and finishes with the count', async () => {
    const leads = Array.from({ length: 40 }, (_, i) => lead(i));
    const { db, calls } = fakeDb({
      leads,
      values: [
        { lead_id: 'l0', value: 'sim', corrected_value: null },
        { lead_id: 'l1', value: null, corrected_value: 'não' },
      ],
    });
    const laya = yes();
    await runColumnJob(db, column, { laya, now: () => 1000 });

    expect(laya.mock.calls.map(([states]) => states.length)).toEqual([BATCH_SIZE, 6]);
    const written = calls.upserts.flat().map((r) => r.lead_id);
    expect(written).toHaveLength(38);
    expect(written).not.toContain('l0');
    expect(written).not.toContain('l1');
    expect(calls.upserts[0][0]).toMatchObject({ column_id: 'col-1', account_id: 'acc-1', value: 'sim', confidence: 0.9 });
    expect(calls.updates.at(-1)).toMatchObject({ table: 'lead_columns', status: 'done', filled_count: 40, model: 'multilingual' });
  });

  it('sends the lead text and the question derived from the title, only for the column account', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const laya = yes();
    await runColumnJob(db, column, { laya });
    const [states, question] = laya.mock.calls[0];
    expect(states[0]).toContain('Nome: Negócio 0');
    expect(question).toEqual({ type: 'noul', instructions: 'Tem site?' });
    expect(calls.filters).toContainEqual(['leads', 'account_id', 'acc-1']);
    expect(calls.filters).toContainEqual(['lead_column_values', 'column_id', 'col-1']);
  });

  it('finishes without calling Laya when every lead is already filled', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)], values: [{ lead_id: 'l0', value: 'não', corrected_value: null }] });
    const laya = yes();
    await runColumnJob(db, column, { laya });
    expect(laya).not.toHaveBeenCalled();
    expect(calls.updates.at(-1)).toMatchObject({ status: 'done', filled_count: 1 });
  });

  it('fails with the Laya message when Laya is off', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const laya = vi.fn().mockRejectedValue(new Error('Laya desligado: rode npm run laya'));
    await runColumnJob(db, column, { laya });
    expect(calls.upserts).toHaveLength(0);
    expect(calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'Laya desligado: rode npm run laya' });
  });

  it('keeps batches already saved when a later batch fails', async () => {
    const { db, calls } = fakeDb({ leads: Array.from({ length: 40 }, (_, i) => lead(i)) });
    const laya = vi.fn()
      .mockImplementationOnce(async (s: string[]) => s.map(() => ({ noul: 0.9 })))
      .mockRejectedValueOnce(new Error('Laya ocupado: tente de novo em instantes'));
    await runColumnJob(db, column, { laya });
    expect(calls.upserts).toHaveLength(1);
    expect(calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'Laya ocupado: tente de novo em instantes' });
  });

  it('fails when Laya answers an option outside the list', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const choiceColumn = { ...column, title: 'Nicho: saúde, beleza', kind: 'choice', options: ['saúde', 'beleza'] } as LeadColumn;
    await runColumnJob(db, choiceColumn, { laya: vi.fn().mockResolvedValue([{ choice: 'esporte' }]) });
    expect(calls.updates.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('fora da lista') });
  });

  it('refuses a title written around the API without calling Laya', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const laya = yes();
    await runColumnJob(db, { ...column, title: '' }, { laya });
    expect(laya).not.toHaveBeenCalled();
    expect(calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'Escreva o título da coluna' });
  });

  it('escalates to arbitrateWithClaude when Laya confidence margin is narrow', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const choiceCol = { ...column, title: 'Nicho: saúde, beleza', kind: 'choice', options: ['saúde', 'beleza'] } as LeadColumn;
    const laya = vi.fn().mockResolvedValue([{ choice: 'saúde', probabilities: { saúde: 0.51, beleza: 0.49 } }]);
    const arbitrateWithClaude = vi.fn().mockResolvedValue('beleza');

    await runColumnJob(db, choiceCol, { laya, arbitrateWithClaude });

    expect(arbitrateWithClaude).toHaveBeenCalledTimes(1);
    expect(calls.upserts[0][0]).toMatchObject({ value: 'beleza', confidence: 0.99 });
  });

  it('stops quietly when the column was deleted while filling', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)], upsertError: () => ({ code: '23503', message: 'fk' }) });
    await runColumnJob(db, column, { laya: yes() });
    expect(calls.updates.filter((u) => u.status === 'failed' || u.status === 'done')).toHaveLength(0);
  });
});

describe('runColumnJob with a trained head (parte B)', () => {
  const choiceCol = { ...column, title: 'Nicho: saúde, beleza', kind: 'choice', options: ['saúde', 'beleza'] } as LeadColumn;
  const unsure = () => vi.fn().mockResolvedValue([
    { choice: 'saúde', probabilities: { saúde: 0.51, beleza: 0.49 } },
    { choice: 'saúde', probabilities: { saúde: 0.52, beleza: 0.48 } },
  ]);

  it('lets a confident head decide before Laya and Claude, and keeps Laya guess in laya_value', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0), lead(1)] });
    const head = vi.fn().mockResolvedValue([{ value: 'beleza', confidence: 0.93 }, null]);
    const arbitrateWithClaude = vi.fn().mockResolvedValue('beleza');
    const done = await runColumnJob(db, choiceCol, { laya: unsure(), head, arbitrateWithClaude });

    expect(done).toBe(true);
    expect(head).toHaveBeenCalledWith(['l0', 'l1'], expect.any(Array));
    expect(arbitrateWithClaude).toHaveBeenCalledTimes(1); // only the lead the head was unsure about
    expect(calls.upserts[0][0]).toMatchObject({ value: 'beleza', confidence: 0.93, source: 'cabeca', laya_value: 'saúde' });
    expect(calls.upserts[0][1]).toMatchObject({ value: 'beleza', source: 'claude', laya_value: 'saúde' });
    expect(calls.updates.at(-1)).toMatchObject({ status: 'done', claude_calls: 1, head_decisions: 1 });
  });

  it('marks cells Laya decided alone as source laya', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    await runColumnJob(db, column, { laya: yes() });
    expect(calls.upserts[0][0]).toMatchObject({ value: 'sim', source: 'laya', laya_value: 'sim' });
    expect(calls.updates.at(-1)).toMatchObject({ claude_calls: 0, head_decisions: 0 });
  });

  it('decides by regional rule for Parece ter dinheiro when address is recognized', async () => {
    const dinheiroCol = {
      id: 'col-dinheiro', account_id: 'acc-1', title: 'Parece ter dinheiro', kind: 'score', options: ['baixo', 'médio', 'alto'], status: 'running',
    } as unknown as LeadColumn;
    const gonzagaLead: Row = {
      ...lead(0),
      raw: { complete_address: { city: 'Santos', borough: 'Gonzaga' } },
    };
    const svCentroLead: Row = {
      ...lead(1),
      raw: { complete_address: { city: 'São Vicente', borough: 'Centro' } },
    };
    const { db, calls } = fakeDb({ leads: [gonzagaLead, svCentroLead] });
    const arbitrateWithClaude = vi.fn();
    const mockLaya = vi.fn<LayaFn>(async (s) => s.map(() => ({ score: 1.0, probabilities: { 0: 0.1, 1: 0.8, 2: 0.1 } })));

    await runColumnJob(db, dinheiroCol, { laya: mockLaya, arbitrateWithClaude });

    expect(arbitrateWithClaude).not.toHaveBeenCalled();
    expect(calls.upserts[0][0]).toMatchObject({ value: 'alto', confidence: 1, source: 'regra' });
    expect(calls.upserts[0][1]).toMatchObject({ value: 'médio', confidence: 1, source: 'regra' });
  });

  it('returns false when the column fails', async () => {
    const { db } = fakeDb({ leads: [lead(0)] });
    expect(await runColumnJob(db, column, { laya: vi.fn().mockRejectedValue(new Error('x')) })).toBe(false);
  });
});

describe('requeueColumnsForAccount', () => {
  it('puts the account done columns back in the queue', async () => {
    const { db, calls } = fakeDb({ leads: [] });
    await requeueColumnsForAccount(db, 'acc-1');
    expect(calls.updates[0]).toMatchObject({ table: 'lead_columns', status: 'pending', error: null });
  });
});
