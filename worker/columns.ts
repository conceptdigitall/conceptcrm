import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLeadState, mapLayaAnswer, parseColumnTitle, toLayaQuestion,
  type LayaAnswer, type LayaQuestion,
} from '@/lib/prospecting/columns';
import { resolveEnsemblePrediction, sanitizeLeadContext } from '@/lib/laya/reliable-inference';
import type { Lead, LeadColumn } from '@/types';
import { LAYA_MODEL } from './laya-client';
import { failJob, finishJob } from './queue';

export const FILL_LIMIT = 500;
export const BATCH_SIZE = 32;
const FK_VIOLATION = '23503';

export type LayaFn = (states: string[], question: LayaQuestion) => Promise<LayaAnswer[]>;

export interface ColumnJobDeps {
  laya: LayaFn;
  now?: () => number;
  arbitrateWithClaude?: (leadText: string, question: LayaQuestion, options: string[]) => Promise<string>;
}

export async function runColumnJob(
  db: SupabaseClient, column: LeadColumn, deps: ColumnJobDeps,
): Promise<void> {
  const now = deps.now ?? Date.now;
  const started = now();
  // RLS lets agents write rows directly: the title, not the stored kind/options, is the truth.
  const parsed = parseColumnTitle(column.title);
  if (!parsed.ok) {
    await failJob(db, 'lead_columns', column.id, parsed.error);
    return;
  }
  const { kind, options } = parsed.value;

  try {
    const { data: leads, error: leadsError } = await db
      .from('leads').select('*').eq('account_id', column.account_id)
      .order('created_at', { ascending: false }).limit(FILL_LIMIT);
    if (leadsError) throw new Error(`Falha ao ler leads: ${leadsError.message}`);
    const { data: existing, error: valuesError } = await db
      .from('lead_column_values').select('lead_id, value, corrected_value').eq('column_id', column.id);
    if (valuesError) throw new Error(`Falha ao ler valores: ${valuesError.message}`);

    const rows = (leads ?? []) as Lead[];
    const filled = new Set(
      (existing ?? [])
        .filter((v) => v.value !== null || v.corrected_value !== null)
        .map((v) => v.lead_id as string),
    );
    const missing = rows.filter((l) => !filled.has(l.id));
    const question = toLayaQuestion(parsed.value);

    let written = 0;
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const chunk = missing.slice(i, i + BATCH_SIZE);
      const leadStates = chunk.map((lead) => sanitizeLeadContext(buildLeadState(lead)));
      const answers = await deps.laya(leadStates, question);
      const updatedAt = new Date(now()).toISOString();

      const batch = await Promise.all(
        chunk.map(async (lead, j) => {
          const rawAnswer = answers[j];
          let mapped = mapLayaAnswer(kind, options, rawAnswer);

          if (deps.arbitrateWithClaude) {
            const ensemble = await resolveEnsemblePrediction(
              kind,
              options,
              rawAnswer,
              leadStates[j],
              question,
              { arbitrateWithClaude: deps.arbitrateWithClaude },
            );
            mapped = { value: ensemble.value, confidence: ensemble.confidence };
          }

          return {
            column_id: column.id,
            lead_id: lead.id,
            account_id: column.account_id,
            ...mapped,
            updated_at: updatedAt,
          };
        }),
      );

      const { error } = await db.from('lead_column_values').upsert(batch, { onConflict: 'column_id,lead_id' });
      if (error) {
        // Column (or lead) deleted while we were filling: nothing left to report on.
        if (error.code === FK_VIOLATION) return;
        throw new Error(`Falha ao salvar valores: ${error.message}`);
      }
      written += batch.length;
    }

    await finishJob(db, 'lead_columns', column.id, {
      filled_count: rows.length - missing.length + written,
      duration_ms: now() - started,
      model: LAYA_MODEL,
    });
  } catch (err) {
    await failJob(db, 'lead_columns', column.id, err instanceof Error ? err.message : String(err));
  }
}

// After a search adds leads, done columns go back to the queue; runColumnJob
// then fills only the new leads.
export async function requeueColumnsForAccount(db: SupabaseClient, accountId: string): Promise<void> {
  await db.from('lead_columns')
    .update({ status: 'pending', error: null, started_at: null })
    .eq('account_id', accountId)
    .eq('status', 'done');
}
