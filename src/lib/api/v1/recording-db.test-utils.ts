// Test-only fake of the supabase-js query builder that records every
// query (table, action, payload, eq/gte/lte filters) so tests can
// assert tenancy filters, and answers each one through `respond`.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RecordedOp {
  table: string;
  action: 'select' | 'insert' | 'update';
  payload?: unknown;
  filters: Record<string, unknown>;
}

type Reply = { data?: unknown; error?: unknown; count?: number };

export function recordingDb(respond: (op: RecordedOp) => Reply = () => ({})) {
  const ops: RecordedOp[] = [];

  const from = (table: string) => {
    const op: RecordedOp = { table, action: 'select', filters: {} };
    let result: Promise<Reply> | null = null;
    const finish = () => {
      if (!result) {
        ops.push(op);
        result = Promise.resolve({ data: null, error: null, ...respond(op) });
      }
      return result;
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => ((op.action = 'insert'), (op.payload = payload), builder),
      update: (payload: unknown) => ((op.action = 'update'), (op.payload = payload), builder),
      eq: (col: string, val: unknown) => ((op.filters[col] = val), builder),
      gte: (col: string, val: unknown) => ((op.filters[`${col}>=`] = val), builder),
      lte: (col: string, val: unknown) => ((op.filters[`${col}<=`] = val), builder),
      order: () => builder,
      limit: () => builder,
      or: () => builder,
      maybeSingle: finish,
      single: finish,
      then: (ok: (v: Reply) => unknown, bad: (e: unknown) => unknown) => finish().then(ok, bad),
    };
    return builder;
  };

  const storage = {
    from: () => ({
      createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/video.mp4' } }),
    }),
  };

  return { db: { from, storage } as unknown as SupabaseClient, ops };
}
