import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinanceEntry, FinanceEntryForm, FinanceSettings } from '@/types/finance';

const SELECT = '*, contact:contacts (id, name, company)';

// Uma consulta só: o painel precisa dos últimos 13 meses (RBT12 + série) e
// dos lançamentos futuros do mês. A RLS já limita à conta, mas o filtro
// explícito por account_id mantém o plano de consulta no índice.
export async function fetchEntries(
  supabase: SupabaseClient,
  accountId: string,
  fromDate: string,
): Promise<FinanceEntry[]> {
  const { data, error } = await supabase
    .from('finance_entries')
    .select(SELECT)
    .eq('account_id', accountId)
    .gte('due_date', fromDate)
    .order('due_date', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as FinanceEntry[];
}

export async function createEntry(
  supabase: SupabaseClient,
  params: { accountId: string; userId?: string | null; form: FinanceEntryForm },
): Promise<void> {
  const { form } = params;
  const { error } = await supabase.from('finance_entries').insert({
    account_id: params.accountId,
    created_by: params.userId ?? null,
    kind: form.kind,
    category: form.category,
    description: form.description,
    amount_cents: form.amount_cents,
    due_date: form.due_date,
    contact_id: form.contact_id || null,
    notes: form.notes || null,
    status: form.paid ? 'pago' : 'pendente',
    paid_at: form.paid ? new Date().toISOString() : null,
  });
  if (error) throw error;
}

export async function markPaid(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from('finance_entries')
    .update({ status: 'pago', paid_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function reopenEntry(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from('finance_entries')
    .update({ status: 'pendente', paid_at: null })
    .eq('id', id);
  if (error) throw error;
}

export async function cancelEntry(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from('finance_entries')
    .update({ status: 'cancelado', paid_at: null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteEntry(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('finance_entries').delete().eq('id', id);
  if (error) throw error;
}

/** Gera as cobranças do mês (AAAA-MM-01) a partir dos contratos. Devolve quantas foram criadas. */
export async function generateReceivables(
  supabase: SupabaseClient,
  accountId: string,
  month: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('generate_contract_receivables', {
    p_account_id: accountId,
    p_month: `${month}-01`,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export async function fetchSettings(
  supabase: SupabaseClient,
  accountId: string,
): Promise<FinanceSettings | null> {
  const { data, error } = await supabase
    .from('finance_settings')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw error;
  return (data as FinanceSettings | null) ?? null;
}

export async function saveAliquota(
  supabase: SupabaseClient,
  accountId: string,
  percent: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('finance_settings')
    .upsert({ account_id: accountId, simples_aliquota_percent: percent }, { onConflict: 'account_id' });
  if (error) throw error;
}
