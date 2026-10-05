import { describe, expect, it, vi } from 'vitest';
import { depthFor, runProspectingJob } from './prospecting';
import type { LeadSearch } from '@/types';

const search = {
  id: 's-1', account_id: 'acc-1', query: 'barbearia', location: 'Santos, SP', max_results: 2,
} as LeadSearch;

function fakeDb() {
  const calls = { upsert: [] as unknown[][], update: [] as Record<string, unknown>[] };
  const db = {
    from(table: string) {
      return {
        upsert(rows: unknown[], opts: unknown) {
          calls.upsert.push([table, rows, opts]);
          // Pretend one of the rows already existed: only the first comes back.
          return { select: async () => ({ data: rows.slice(0, 1), error: null }) };
        },
        update(patch: Record<string, unknown>) {
          calls.update.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  return { db: db as never, calls };
}

const places = JSON.stringify([
  { title: 'A', place_id: 'p1', phone: '(13) 99123-4567' },
  { title: 'B', place_id: 'p2' },
  { title: 'C', place_id: 'p3' },
]);

describe('depthFor', () => {
  it('scales scroll depth with the requested count', () => {
    expect(depthFor(1)).toBe(1);
    expect(depthFor(50)).toBe(5);
    expect(depthFor(100)).toBe(10);
    expect(depthFor(200)).toBe(20);
  });
});

describe('runProspectingJob', () => {
  it('scrapes "<query> em <location>", truncates to max_results, upserts ignoring duplicates, finishes with new count', async () => {
    const { db, calls } = fakeDb();
    const scrape = vi.fn().mockResolvedValue(places);
    await runProspectingJob(db, search, { scrape });
    expect(scrape).toHaveBeenCalledWith('barbearia em Santos, SP', 1);
    const [table, rows, opts] = calls.upsert[0] as [string, { place_id: string }[], unknown];
    expect(table).toBe('leads');
    expect(rows.map((r) => r.place_id)).toEqual(['p1', 'p2']);
    expect(opts).toEqual({ onConflict: 'account_id,place_id', ignoreDuplicates: true });
    expect(calls.update.at(-1)).toMatchObject({ status: 'done', result_count: 1 });
  });
  it('finishes with 0 when the scraper finds nothing', async () => {
    const { db, calls } = fakeDb();
    await runProspectingJob(db, search, { scrape: async () => '' });
    expect(calls.upsert).toHaveLength(0);
    expect(calls.update.at(-1)).toMatchObject({ status: 'done', result_count: 0 });
  });
  it('refuses a row whose query has a newline (written around the API) without scraping', async () => {
    const { db, calls } = fakeDb();
    const scrape = vi.fn();
    await runProspectingJob(db, { ...search, query: 'a\nb' }, { scrape });
    expect(scrape).not.toHaveBeenCalled();
    expect(calls.update.at(-1)).toMatchObject({ status: 'failed', error: 'Use uma linha só' });
  });
  it('fails the job with a readable error when the scraper throws', async () => {
    const { db, calls } = fakeDb();
    await runProspectingJob(db, search, { scrape: async () => { throw new Error('docker: not found'); } });
    expect(calls.update.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('docker: not found') });
  });
});
