import type { SupabaseClient } from '@supabase/supabase-js';

export type JobTable = 'lead_searches' | 'marketing_videos';

export async function claimNext<T>(
  db: SupabaseClient, table: JobTable, accountIds: string[],
): Promise<T | null> {
  const { data: candidates } = await db
    .from(table).select('id').eq('status', 'pending').in('account_id', accountIds)
    .order('created_at', { ascending: true }).limit(1);
  const next = candidates?.[0];
  if (!next) return null;
  // Conditional update: if another worker (or a retry) changed the row,
  // zero rows match and we skip it.
  const { data: claimed } = await db
    .from(table)
    .update({ status: 'running', started_at: new Date().toISOString(), error: null })
    .eq('id', next.id)
    .eq('status', 'pending')
    .select();
  return (claimed?.[0] as T | undefined) ?? null;
}

export async function finishJob(
  db: SupabaseClient, table: JobTable, id: string, patch: Record<string, unknown>,
): Promise<void> {
  await db.from(table).update({ ...patch, status: 'done', finished_at: new Date().toISOString() }).eq('id', id);
}

export async function failJob(db: SupabaseClient, table: JobTable, id: string, message: string): Promise<void> {
  await db.from(table)
    .update({ status: 'failed', error: message.slice(0, 2000), finished_at: new Date().toISOString() })
    .eq('id', id);
}

// Only one worker runs at a time, so at startup any `running` row was
// orphaned by a previous run (crash, Ctrl+C, Mac asleep).
export async function requeueOrphaned(db: SupabaseClient, table: JobTable): Promise<number> {
  const { data } = await db
    .from(table)
    .update({ status: 'pending', started_at: null })
    .eq('status', 'running')
    .select();
  return data?.length ?? 0;
}
