import { describe, expect, it, vi } from 'vitest';
import type { LeadColumn } from '@/types';
import { headPredictor, leadText, leadVectors, teachColumn, trainColumn, TEACH_SIZE, type EmbedFn } from './learning';

type Row = Record<string, unknown>;

// In-memory Supabase with just the query surface the learning code uses.
function memoryDb(tables: Record<string, Row[]>) {
  const keys: Record<string, string[]> = {
    lead_embeddings: ['lead_id'], lead_column_heads: ['column_id'], lead_column_values: ['column_id', 'lead_id'],
  };
  const db = {
    from(table: string) {
      tables[table] ??= [];
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
        in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
        is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
        or: (expr: string) => {
          const parts = expr.split(',').map((p) => p.split('.'));
          filters.push((r) => parts.some(([c, op, v]) =>
            op === 'is' ? (r[c] ?? null) === null : op === 'neq' ? r[c] != null && r[c] !== v : r[c] === v));
          return q;
        },
        update: (p: Row) => { patch = p; return q; },
        upsert: async (input: Row | Row[]) => {
          const k = keys[table];
          for (const row of Array.isArray(input) ? input : [input]) {
            const found = tables[table].find((r) => k.every((c) => r[c] === row[c]));
            if (found) Object.assign(found, row); else tables[table].push({ ...row });
          }
          return { error: null };
        },
        maybeSingle: async () => ({ data: tables[table].find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          const rows = tables[table].filter((r) => filters.every((f) => f(r)));
          if (patch) rows.forEach((r) => Object.assign(r, patch));
          resolve({ data: rows, error: null });
        },
      };
      return q;
    },
  };
  return db as never;
}

const column = {
  id: 'col-1', account_id: 'acc-1', title: 'Nicho: saúde, beleza', kind: 'choice', options: ['saúde', 'beleza'],
  status: 'done', examples_count: null,
} as unknown as LeadColumn;

// Even leads are salons (beleza), odd are clinics (saúde).
const lead = (i: number): Row => ({
  id: `l${i}`, account_id: 'acc-1', name: `Negócio ${i}`, category: i % 2 === 0 ? 'Salão de beleza' : 'Clínica',
  rating: null, review_count: null, website: null, phone: null, is_mobile: false,
});
const truth = (i: number) => (i % 2 === 0 ? 'beleza' : 'saúde');

// A fake encoder that separates the two categories, with a little spread.
const embed = vi.fn<EmbedFn>(async (texts) => texts.map((t) => {
  const salon = t.includes('Salão');
  const n = Number(/Negócio (\d+)/.exec(t)?.[1] ?? 0);
  return Array.from({ length: 8 }, (_, j) => (salon === (j % 2 === 0) ? 1 : -1) + ((n * 7 + j) % 5) * 0.05);
}));

describe('leadVectors', () => {
  it('embeds once and reuses the cache until the lead text changes', async () => {
    const tables: Record<string, Row[]> = {};
    const db = memoryDb(tables);
    const e = vi.fn<EmbedFn>(async (texts) => texts.map(() => [1, 2]));
    await leadVectors(db, 'acc-1', [{ leadId: 'l0', text: 'a' }, { leadId: 'l1', text: 'b' }], e);
    const again = await leadVectors(db, 'acc-1', [{ leadId: 'l0', text: 'a' }, { leadId: 'l1', text: 'b2' }], e);
    expect(e).toHaveBeenCalledTimes(2);
    expect(e.mock.calls[1][0]).toEqual(['b2']);
    expect(again.get('l0')).toEqual([1, 2]);
    expect(tables.lead_embeddings).toHaveLength(2);
  });
});

describe('teachColumn', () => {
  it('asks Claude about leads spread across Laya guesses and stores them as examples', async () => {
    const values = Array.from({ length: 40 }, (_, i) => ({
      column_id: 'col-1', lead_id: `l${i}`, value: i < 36 ? 'saúde' : 'beleza', source: 'laya',
      laya_value: i < 36 ? 'saúde' : 'beleza', corrected_value: null,
    }));
    values[0].corrected_value = 'beleza' as never; // João's correction is never asked about
    const tables: Record<string, Row[]> = {
      lead_column_values: values, leads: Array.from({ length: 40 }, (_, i) => lead(i)), lead_columns: [{ ...column }],
    };
    const arbitrate = vi.fn(async (text: string) => (text.includes('Salão') ? 'Beleza' : 'saúde'));
    const taught = await teachColumn(memoryDb(tables), column, arbitrate);

    expect(taught).toBe(TEACH_SIZE);
    const asked = arbitrate.mock.calls.map(([text]) => Number(/Negócio (\d+)/.exec(text)![1]));
    expect(asked).not.toContain(0);
    expect(asked.filter((i) => i >= 36)).toHaveLength(4); // every rare "beleza" guess was included
    const claude = tables.lead_column_values.filter((r) => r.source === 'claude');
    expect(claude).toHaveLength(TEACH_SIZE);
    expect(claude.find((r) => r.lead_id === 'l2')).toMatchObject({ value: 'beleza', laya_value: 'saúde', confidence: 0.99 });
    expect(tables.lead_columns[0].taught_at).toBeTruthy();
  });

  it('skips answers outside the options', async () => {
    const tables: Record<string, Row[]> = {
      lead_column_values: [{ column_id: 'col-1', lead_id: 'l1', value: 'saúde', source: 'laya', laya_value: 'saúde', corrected_value: null }],
      leads: [lead(1)], lead_columns: [{ ...column }],
    };
    expect(await teachColumn(memoryDb(tables), column, async () => 'esporte')).toBe(0);
    expect(tables.lead_column_values[0].source).toBe('laya');
  });
});

describe('trainColumn', () => {
  // 20 examples from Claude (right), where Laya guessed "saúde" for everything (half wrong).
  function seeded(examples = 20) {
    return {
      lead_column_values: Array.from({ length: 30 }, (_, i) => ({
        column_id: 'col-1', lead_id: `l${i}`, corrected_value: null,
        ...(i < examples
          ? { value: truth(i), source: 'claude', laya_value: 'saúde' }
          : { value: 'saúde', source: 'laya', laya_value: 'saúde' }),
      })),
      leads: Array.from({ length: 30 }, (_, i) => lead(i)),
      lead_columns: [{ ...column }],
    } as Record<string, Row[]>;
  }

  it('adopts a head that beats Laya, clears the cells Laya decided and requeues the column', async () => {
    const tables = seeded();
    const outcome = await trainColumn(memoryDb(tables), column, embed);

    expect(outcome).toBe('adopted');
    expect(tables.lead_column_heads[0]).toMatchObject({ column_id: 'col-1', labels: ['saúde', 'beleza'] });
    expect(tables.lead_columns[0]).toMatchObject({ status: 'pending', examples_count: 20 });
    expect(tables.lead_columns[0].head_accuracy as number).toBeGreaterThan(tables.lead_columns[0].base_accuracy as number);
    expect(tables.lead_column_values.filter((r) => r.source === 'claude')).toHaveLength(20);
    expect(tables.lead_column_values.filter((r) => r.value === null)).toHaveLength(10);
  });

  it('waits for enough examples, and for new ones before retraining', async () => {
    expect(await trainColumn(memoryDb(seeded(8)), column, embed)).toBe('skipped');
    const trained = { ...column, examples_count: 18 } as LeadColumn;
    expect(await trainColumn(memoryDb(seeded()), trained, embed)).toBe('skipped');
    expect(await trainColumn(memoryDb(seeded()), trained, embed, { force: true })).toBe('adopted');
  });

  it('counts João corrections as examples', async () => {
    const tables = seeded(10);
    for (let i = 10; i < 16; i++) tables.lead_column_values[i].corrected_value = truth(i);
    await trainColumn(memoryDb(tables), column, embed);
    expect(tables.lead_columns[0].examples_count).toBe(16);
  });
});

describe('headPredictor', () => {
  it('is undefined without a head, and answers only when the head is confident', async () => {
    const tables: Record<string, Row[]> = {};
    const db = memoryDb(tables);
    expect(await headPredictor(db, column, embed)).toBeUndefined();

    const trainTables = {
      lead_column_values: Array.from({ length: 20 }, (_, i) => ({
        column_id: 'col-1', lead_id: `l${i}`, value: truth(i), source: 'claude', laya_value: 'saúde', corrected_value: null,
      })),
      leads: Array.from({ length: 20 }, (_, i) => lead(i)), lead_columns: [{ ...column }],
    } as Record<string, Row[]>;
    const trainDb = memoryDb(trainTables);
    await trainColumn(trainDb, column, embed);
    const predict = await headPredictor(trainDb, column, embed);
    const states = [lead(40), lead(41)].map((l) => leadText(l as never));
    const out = await predict!(['l40', 'l41'], states);
    expect(out.map((p) => p?.value)).toEqual(['beleza', 'saúde']);
  });

  it('steps aside when the Laya server has no embed route', async () => {
    const tables = { lead_column_heads: [{ column_id: 'col-1', labels: ['saúde', 'beleza'], weights: [[0], [0]], bias: [0, 0], mu: [0], sd: [1], threshold: 0.6 }] };
    const predict = await headPredictor(memoryDb(tables), column, vi.fn().mockRejectedValue(new Error('sem a rota')));
    expect(await predict!(['l1'], ['x'])).toEqual([null]);
  });
});
