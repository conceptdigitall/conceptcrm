import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  allowedValues, buildLeadState, canonicalValue, parseColumnTitle, toLayaQuestion,
  type LayaQuestion,
} from '@/lib/prospecting/columns';
import { sanitizeLeadContext } from '@/lib/laya/reliable-inference';
import { hasEnoughExamples, predictHead, selectHead, type HeadModel } from '@/lib/laya/head';
import type { Lead, LeadColumn } from '@/types';
import { LAYA_MODEL } from './laya-client';

// Parte B: each AI column learns from its own examples. See
// docs/superpowers/specs/2026-10-01-planilha-preditiva-parte-b-design.md.

export const TEACH_SIZE = 30;
export const CORRECTION_WEIGHT = 3;
/** Retrain only when this many examples arrived since the last training. */
export const RETRAIN_AFTER = 5;

export type EmbedFn = (texts: string[]) => Promise<number[][]>;
export type ArbitrateFn = (leadText: string, question: LayaQuestion, options: string[]) => Promise<string>;
export type HeadPrediction = { value: string; confidence: number } | null;
export type HeadPredictor = (leadIds: string[], states: string[]) => Promise<HeadPrediction[]>;

export const leadText = (lead: Lead) => sanitizeLeadContext(buildLeadState(lead));
const hash = (text: string) => createHash('sha1').update(text).digest('hex');

/** Vectors for the given leads, from the cache when the lead text did not change. */
export async function leadVectors(
  db: SupabaseClient, accountId: string, items: { leadId: string; text: string }[], embed: EmbedFn,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (items.length === 0) return out;
  const { data: cached } = await db
    .from('lead_embeddings').select('lead_id, state_hash, vector')
    .eq('model', LAYA_MODEL).in('lead_id', items.map((i) => i.leadId));
  const byLead = new Map((cached ?? []).map((r) => [r.lead_id as string, r]));
  const missing = items.filter((i) => byLead.get(i.leadId)?.state_hash !== hash(i.text));
  for (const i of items) {
    const row = byLead.get(i.leadId);
    if (row && row.state_hash === hash(i.text)) out.set(i.leadId, (row.vector as number[]).map(Number));
  }
  if (missing.length > 0) {
    const vectors = await embed(missing.map((i) => i.text));
    const rows = missing.map((i, j) => ({
      lead_id: i.leadId, account_id: accountId, model: LAYA_MODEL,
      state_hash: hash(i.text), vector: vectors[j], updated_at: new Date().toISOString(),
    }));
    const { error } = await db.from('lead_embeddings').upsert(rows, { onConflict: 'lead_id' });
    if (error) console.warn('[aprendizado] cache de vetores não salvou:', error.message);
    missing.forEach((i, j) => out.set(i.leadId, vectors[j]));
  }
  return out;
}

export async function loadHead(db: SupabaseClient, columnId: string): Promise<HeadModel | null> {
  const { data } = await db.from('lead_column_heads').select('*').eq('column_id', columnId).maybeSingle();
  if (!data) return null;
  return {
    labels: data.labels, weights: data.weights, bias: data.bias.map(Number),
    mu: data.mu.map(Number), sd: data.sd.map(Number), threshold: Number(data.threshold),
  };
}

/**
 * The head of a column as a function for runColumnJob: a value when the head is
 * confident, null otherwise (Laya and Claude decide). Without a head, or with a Laya
 * server that has no /v1/embed, every answer is null and the column works as before.
 */
export async function headPredictor(
  db: SupabaseClient, column: LeadColumn, embed: EmbedFn,
): Promise<HeadPredictor | undefined> {
  const head = await loadHead(db, column.id);
  if (!head) return undefined;
  return async (leadIds, states) => {
    let vectors: Map<string, number[]>;
    try {
      vectors = await leadVectors(db, column.account_id, leadIds.map((leadId, i) => ({ leadId, text: states[i] })), embed);
    } catch (err) {
      console.warn('[aprendizado] sem vetores, a cabeça fica de fora:', (err as Error).message);
      return leadIds.map(() => null);
    }
    return leadIds.map((id) => {
      const v = vectors.get(id);
      if (!v) return null;
      const p = predictHead(head, v);
      return p.confidence >= head.threshold ? { value: p.label, confidence: p.confidence } : null;
    });
  };
}

interface ValueRow {
  lead_id: string;
  value: string | null;
  corrected_value: string | null;
  source: string | null;
  laya_value: string | null;
}

// What Laya's base model said: rows filled before migration 047 have no laya_value,
// but back then Claude never answered (the arbitrator model was retired), so `value` was Laya's.
const baseGuess = (r: ValueRow) => r.laya_value ?? (r.source === null ? r.value : null);

async function readValues(db: SupabaseClient, columnId: string): Promise<ValueRow[]> {
  const { data, error } = await db
    .from('lead_column_values').select('lead_id, value, corrected_value, source, laya_value').eq('column_id', columnId);
  if (error) throw new Error(`Falha ao ler valores: ${error.message}`);
  return (data ?? []) as ValueRow[];
}

/**
 * "Ensinar com Claude": Claude labels up to TEACH_SIZE leads once, spread across Laya's
 * guesses so the examples are not all one class. Their cells become source = 'claude'.
 * Returns how many leads were labelled.
 */
export async function teachColumn(db: SupabaseClient, column: LeadColumn, arbitrate: ArbitrateFn): Promise<number> {
  const parsed = parseColumnTitle(column.title);
  if (!parsed.ok) return 0;
  const { kind, options } = parsed.value;
  const question = toLayaQuestion(parsed.value);

  const values = await readValues(db, column.id);
  const candidates = values.filter((v) => v.corrected_value === null && v.source !== 'claude');
  const groups = new Map<string, ValueRow[]>();
  for (const v of candidates) {
    const key = baseGuess(v) ?? '';
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  // Round-robin across Laya's guesses, so a rare guess still gets examples.
  const picked: ValueRow[] = [];
  const queues = [...groups.values()];
  while (picked.length < TEACH_SIZE && queues.some((q) => q.length > 0)) {
    for (const q of queues) if (q.length > 0 && picked.length < TEACH_SIZE) picked.push(q.shift()!);
  }
  if (picked.length === 0) return 0;

  const { data: leads, error } = await db.from('leads').select('*').in('id', picked.map((p) => p.lead_id));
  if (error) throw new Error(`Falha ao ler leads: ${error.message}`);
  const leadById = new Map(((leads ?? []) as Lead[]).map((l) => [l.id, l]));

  let taught = 0;
  for (const row of picked) {
    const lead = leadById.get(row.lead_id);
    if (!lead) continue;
    let answer: string | null = null;
    try {
      answer = canonicalValue(kind, options, await arbitrate(leadText(lead), question, options));
    } catch (err) {
      console.warn('[aprendizado] Claude não respondeu:', (err as Error).message);
    }
    if (!answer) continue;
    const { error: upsertError } = await db.from('lead_column_values').update({
      value: answer, confidence: 0.99, source: 'claude', laya_value: baseGuess(row),
      updated_at: new Date().toISOString(),
    }).eq('column_id', column.id).eq('lead_id', row.lead_id);
    if (!upsertError) taught += 1;
  }
  await db.from('lead_columns').update({ taught_at: new Date().toISOString() }).eq('id', column.id);
  return taught;
}

/**
 * Trains a head on the column's examples (Claude's answers and João's corrections) and
 * adopts it only when, cross-validated, it beats Laya's base model. On adoption the
 * cells not decided by Claude nor corrected are cleared and the column goes back to
 * the queue, so the next run refills them with the new head.
 */
export async function trainColumn(
  db: SupabaseClient, column: LeadColumn, embed: EmbedFn, opts: { force?: boolean } = {},
): Promise<'adopted' | 'kept' | 'skipped'> {
  const parsed = parseColumnTitle(column.title);
  if (!parsed.ok) return 'skipped';
  const labels = allowedValues(parsed.value.kind, parsed.value.options);

  const values = await readValues(db, column.id);
  const examples = values.flatMap((v) => {
    const label = v.corrected_value ?? (v.source === 'claude' ? v.value : null);
    const y = label ? labels.indexOf(label) : -1;
    return y < 0 ? [] : [{ row: v, y, weight: v.corrected_value ? CORRECTION_WEIGHT : 1 }];
  });
  const fresh = examples.length - (column.examples_count ?? 0);
  if (!hasEnoughExamples(examples.map((e) => e.y), labels.length)) return 'skipped';
  if (!opts.force && fresh < RETRAIN_AFTER) return 'skipped';

  const { data: leads, error } = await db.from('leads').select('*').in('id', examples.map((e) => e.row.lead_id));
  if (error) throw new Error(`Falha ao ler leads: ${error.message}`);
  const leadById = new Map(((leads ?? []) as Lead[]).map((l) => [l.id, l]));
  const usable = examples.filter((e) => leadById.has(e.row.lead_id));
  const vectors = await leadVectors(
    db, column.account_id,
    usable.map((e) => ({ leadId: e.row.lead_id, text: leadText(leadById.get(e.row.lead_id)!) })),
    embed,
  );

  const result = selectHead({
    vectors: usable.map((e) => vectors.get(e.row.lead_id)!),
    y: usable.map((e) => e.y),
    labels,
    baseCorrect: usable.map((e) => {
      const guess = baseGuess(e.row);
      return guess === null ? null : guess === labels[e.y];
    }),
    sampleWeight: usable.map((e) => e.weight),
  });

  const now = new Date().toISOString();
  const summary: Record<string, unknown> = { examples_count: usable.length, trained_at: now };
  if (!result) {
    await db.from('lead_columns').update(summary).eq('id', column.id);
    return 'kept';
  }

  const { model, stats } = result;
  const { error: headError } = await db.from('lead_column_heads').upsert({
    column_id: column.id, account_id: column.account_id, labels: model.labels, weights: model.weights,
    bias: model.bias, mu: model.mu, sd: model.sd, threshold: model.threshold, trained_at: now,
  }, { onConflict: 'column_id' });
  if (headError) throw new Error(`Falha ao salvar a cabeça: ${headError.message}`);

  await db.from('lead_column_values')
    .update({ value: null, confidence: null, source: null, updated_at: now })
    // Everything not decided by Claude nor corrected by João (old rows have no source).
    .eq('column_id', column.id).or('source.is.null,source.neq.claude').is('corrected_value', null);
  await db.from('lead_columns').update({
    ...summary,
    head_accuracy: stats.accuracy, base_accuracy: stats.baseAccuracy, head_coverage: stats.coverage,
    status: 'pending', started_at: null, finished_at: null, error: null,
  }).eq('id', column.id);
  return 'adopted';
}

/**
 * After a column run: if João asked for "Ensinar com Claude" (and it never ran), teach and
 * train right away; otherwise retrain when enough new examples arrived. Learning problems
 * are logged, never turned into a failed column: the cells are already filled.
 */
export async function learnAfterRun(
  db: SupabaseClient, columnId: string, deps: { embed: EmbedFn; arbitrate: ArbitrateFn },
): Promise<void> {
  try {
    const { data } = await db.from('lead_columns').select('*').eq('id', columnId).maybeSingle();
    const column = data as LeadColumn | null;
    if (!column) return;
    if (column.teach_requested_at && !column.taught_at) {
      const taught = await teachColumn(db, column, deps.arbitrate);
      console.log(`[aprendizado] ${column.title}: Claude rotulou ${taught} leads`);
      const outcome = await trainColumn(db, column, deps.embed, { force: true });
      console.log(`[aprendizado] ${column.title}: cabeça ${outcome}`);
      return;
    }
    const outcome = await trainColumn(db, column, deps.embed);
    if (outcome !== 'skipped') console.log(`[aprendizado] ${column.title}: cabeça ${outcome}`);
  } catch (err) {
    console.warn('[aprendizado] falhou, a coluna segue como está:', (err as Error).message);
  }
}
