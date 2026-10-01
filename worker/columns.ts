import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLeadState, mapLayaAnswer, parseColumnTitle, toLayaQuestion,
  type LayaAnswer, type LayaQuestion,
} from '@/lib/prospecting/columns';
import type { Lead, LeadColumn } from '@/types';
import { LAYA_MODEL } from './laya-client';
import { failJob, finishJob } from './queue';

export const FILL_LIMIT = 500;
export const BATCH_SIZE = 32;
const FK_VIOLATION = '23503';

export type LayaFn = (states: string[], question: LayaQuestion) => Promise<LayaAnswer[]>;

export async function runColumnJob(
  db: SupabaseClient, column: LeadColumn, deps: { laya: LayaFn; now?: () => number },
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
      const answers = await deps.laya(chunk.map(buildLeadState), question);
      const updatedAt = new Date(now()).toISOString();
      const batch = chunk.map((lead, j) => ({
        column_id: column.id,
        lead_id: lead.id,
        account_id: column.account_id,
        ...mapLayaAnswer(kind, options, answers[j]),
        updated_at: updatedAt,
      }));
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
