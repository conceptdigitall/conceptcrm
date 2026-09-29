import { describe, expect, it } from 'vitest';
import { claimNext, failJob, finishJob, requeueOrphaned } from './queue';

type Row = Record<string, unknown> & { id: string; status: string; created_at: string; started_at?: string | null };

function fakeDb(rows: Row[]) {
  const db = {
    rows,
    from() {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return q; },
        in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return q; },
        lt: (col: string, v: string) => { filters.push((r) => typeof r[col] === 'string' && (r[col] as string) < v); return q; },
        order: () => q,
        limit: () => q,
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          let matched = rows.filter((r) => filters.every((f) => f(r)))
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          if (patch) { for (const r of matched) Object.assign(r, patch); }
          else matched = matched.slice(0, 1);
          resolve({ data: matched, error: null });
        },
      };
      return q;
    },
  };
  return db as unknown as Parameters<typeof claimNext>[0] & { rows: Row[] };
}

describe('queue', () => {
  it('claims the oldest pending job and marks it running', async () => {
    const db = fakeDb([
      { id: 'b', status: 'pending', created_at: '2026-09-29T10:02:00Z', account_id: 'acc-1' },
      { id: 'a', status: 'pending', created_at: '2026-09-29T10:01:00Z', account_id: 'acc-1' },
    ]);
    const job = await claimNext<Row>(db, 'lead_searches', ['acc-1']);
    expect(job?.id).toBe('a');
    expect(db.rows.find((r) => r.id === 'a')?.status).toBe('running');
    expect(db.rows.find((r) => r.id === 'b')?.status).toBe('pending');
  });
  it('only claims jobs from the allowed accounts', async () => {
    const db = fakeDb([
      { id: 'outsider', status: 'pending', created_at: '2026-09-29T10:00:00Z', account_id: 'x' },
      { id: 'concept', status: 'pending', created_at: '2026-09-29T10:05:00Z', account_id: 'acc-1' },
    ]);
    const job = await claimNext<Row>(db, 'lead_searches', ['acc-1']);
    expect(job?.id).toBe('concept');
    expect(db.rows.find((r) => r.id === 'outsider')?.status).toBe('pending');
  });
  it('returns null when nothing is pending', async () => {
    expect(await claimNext(fakeDb([{ id: 'a', status: 'done', created_at: 'x' }]), 'lead_searches', ['acc-1'])).toBeNull();
  });
  it('requeueOrphaned returns every running job to pending, however recent', async () => {
    const db = fakeDb([
      { id: 'recent', status: 'running', created_at: 'x', started_at: new Date().toISOString() },
      { id: 'done', status: 'done', created_at: 'y', started_at: new Date().toISOString() },
    ]);
    expect(await requeueOrphaned(db, 'lead_searches')).toBe(1);
    expect(db.rows.find((r) => r.id === 'recent')?.status).toBe('pending');
    expect(db.rows.find((r) => r.id === 'done')?.status).toBe('done');
  });
  it('fail and finish set status and finished_at', async () => {
    const db = fakeDb([
      { id: 'a', status: 'running', created_at: 'x' },
      { id: 'b', status: 'running', created_at: 'y' },
    ]);
    await failJob(db, 'lead_searches', 'a', 'x'.repeat(3000));
    await finishJob(db, 'lead_searches', 'b', { result_count: 3 });
    const a = db.rows.find((r) => r.id === 'a')!;
    const b = db.rows.find((r) => r.id === 'b')!;
    expect(a.status).toBe('failed');
    expect((a.error as string).length).toBe(2000);
    expect(b).toMatchObject({ status: 'done', result_count: 3 });
    expect(b.finished_at).toBeTruthy();
  });
});
