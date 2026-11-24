// Armazenamento no Supabase (tabelas da migration 065_finance_unified.sql).
// Usa o cliente da sessão do usuário: o RLS exige papel admin na conta, e
// toda consulta também filtra por account_id explicitamente.
// Validado contra o banco na migration 065.

import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_CATEGORIES } from './defaults';
import type {
  CategoryPatch, EntryFilter, EntryPatch, FinanceRepository, NewCategory, NewEntry, NewRecurring, RecurringPatch,
} from './repository';
import type { FinanceCategory, FinanceEntry, FinanceRecurring } from './types';

const CATEGORY_COLS = 'id, name, kind, color, archived, created_at';
const ENTRY_COLS =
  'id, kind, description, category_id, amount_cents, currency, date, rate_to_brl, rate_source, rate_date, amount_brl_cents, actual_brl_cents, recurring_id, notes, created_at, updated_at';
const RECURRING_COLS =
  'id, kind, description, category_id, amount_cents, currency, cycle, next_date, active, notes, created_at, updated_at';

export class FinanceStorageError extends Error {
  constructor(op: string, detail?: string) {
    super(`Falha no armazenamento financeiro (${op})${detail ? `: ${detail}` : ''}`);
    this.name = 'FinanceStorageError';
  }
}

// PostgREST pode devolver bigint/numeric como string; normaliza para number.
const toEntry = (r: Record<string, unknown>): FinanceEntry => ({
  ...(r as unknown as FinanceEntry),
  amount_cents: Number(r.amount_cents),
  rate_to_brl: Number(r.rate_to_brl),
  amount_brl_cents: Number(r.amount_brl_cents),
  actual_brl_cents: r.actual_brl_cents === null ? null : Number(r.actual_brl_cents),
});
const toRecurring = (r: Record<string, unknown>): FinanceRecurring => ({
  ...(r as unknown as FinanceRecurring),
  amount_cents: Number(r.amount_cents),
});

export function createSupabaseRepository(db: SupabaseClient, accountId: string, userId: string | null): FinanceRepository {
  const stamp = () => ({ updated_at: new Date().toISOString(), updated_by: userId });

  async function seedIfEmpty(): Promise<void> {
    const { count, error } = await db
      .from('finance_categories')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId);
    if (error) throw new FinanceStorageError('contar categorias', error.message);
    if ((count ?? 0) > 0) return;
    // UNIQUE (account_id, kind, name) + ignoreDuplicates: duas abas abrindo juntas não duplicam.
    const { error: seedErr } = await db
      .from('finance_categories')
      .upsert(DEFAULT_CATEGORIES.map((c) => ({ ...c, account_id: accountId })), {
        onConflict: 'account_id,kind,name',
        ignoreDuplicates: true,
      });
    if (seedErr) throw new FinanceStorageError('criar categorias iniciais', seedErr.message);
  }

  return {
    async listCategories() {
      await seedIfEmpty();
      const { data, error } = await db.from('finance_categories').select(CATEGORY_COLS).eq('account_id', accountId).order('name');
      if (error) throw new FinanceStorageError('listar categorias', error.message);
      return (data ?? []) as FinanceCategory[];
    },

    async createCategory(input: NewCategory) {
      const { data, error } = await db
        .from('finance_categories')
        .insert({ ...input, account_id: accountId })
        .select(CATEGORY_COLS)
        .single();
      if (error) throw new FinanceStorageError('criar categoria', error.code === '23505' ? 'nome repetido' : error.message);
      return data as FinanceCategory;
    },

    async updateCategory(id: string, patch: CategoryPatch) {
      const { data, error } = await db
        .from('finance_categories')
        .update(patch)
        .eq('account_id', accountId)
        .eq('id', id)
        .select(CATEGORY_COLS)
        .maybeSingle();
      if (error) throw new FinanceStorageError('editar categoria', error.message);
      return (data as FinanceCategory | null) ?? null;
    },

    async deleteCategory(id: string) {
      // ON DELETE SET NULL nas FKs deixa lançamentos e fixos sem categoria.
      const { data, error } = await db.from('finance_categories').delete().eq('account_id', accountId).eq('id', id).select('id');
      if (error) throw new FinanceStorageError('apagar categoria', error.message);
      return (data ?? []).length > 0;
    },

    async listEntries(filter: EntryFilter = {}) {
      let q = db.from('finance_entries').select(ENTRY_COLS).eq('account_id', accountId);
      if (filter.from) q = q.gte('date', filter.from);
      if (filter.to) q = q.lte('date', filter.to);
      const { data, error } = await q.order('date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw new FinanceStorageError('listar lançamentos', error.message);
      return (data ?? []).map(toEntry);
    },

    async getEntry(id: string) {
      const { data, error } = await db.from('finance_entries').select(ENTRY_COLS).eq('account_id', accountId).eq('id', id).maybeSingle();
      if (error) throw new FinanceStorageError('ler lançamento', error.message);
      return data ? toEntry(data) : null;
    },

    async createEntry(input: NewEntry) {
      const { data, error } = await db
        .from('finance_entries')
        .insert({ ...input, account_id: accountId, created_by: userId, updated_by: userId })
        .select(ENTRY_COLS)
        .single();
      if (error) throw new FinanceStorageError('criar lançamento', error.message);
      return toEntry(data);
    },

    async updateEntry(id: string, patch: EntryPatch) {
      const { data, error } = await db
        .from('finance_entries')
        .update({ ...patch, ...stamp() })
        .eq('account_id', accountId)
        .eq('id', id)
        .select(ENTRY_COLS)
        .maybeSingle();
      if (error) throw new FinanceStorageError('editar lançamento', error.message);
      return data ? toEntry(data) : null;
    },

    async deleteEntry(id: string) {
      const { data, error } = await db.from('finance_entries').delete().eq('account_id', accountId).eq('id', id).select('id');
      if (error) throw new FinanceStorageError('apagar lançamento', error.message);
      return (data ?? []).length > 0;
    },

    async listRecurring() {
      const { data, error } = await db.from('finance_recurring').select(RECURRING_COLS).eq('account_id', accountId).order('next_date');
      if (error) throw new FinanceStorageError('listar fixos', error.message);
      return (data ?? []).map(toRecurring);
    },

    async getRecurring(id: string) {
      const { data, error } = await db.from('finance_recurring').select(RECURRING_COLS).eq('account_id', accountId).eq('id', id).maybeSingle();
      if (error) throw new FinanceStorageError('ler fixo', error.message);
      return data ? toRecurring(data) : null;
    },

    async createRecurring(input: NewRecurring) {
      const { data, error } = await db
        .from('finance_recurring')
        .insert({ ...input, account_id: accountId, created_by: userId, updated_by: userId })
        .select(RECURRING_COLS)
        .single();
      if (error) throw new FinanceStorageError('criar fixo', error.message);
      return toRecurring(data);
    },

    async updateRecurring(id: string, patch: RecurringPatch) {
      const { data, error } = await db
        .from('finance_recurring')
        .update({ ...patch, ...stamp() })
        .eq('account_id', accountId)
        .eq('id', id)
        .select(RECURRING_COLS)
        .maybeSingle();
      if (error) throw new FinanceStorageError('editar fixo', error.message);
      return data ? toRecurring(data) : null;
    },

    async deleteRecurring(id: string) {
      const { data, error } = await db.from('finance_recurring').delete().eq('account_id', accountId).eq('id', id).select('id');
      if (error) throw new FinanceStorageError('apagar fixo', error.message);
      return (data ?? []).length > 0;
    },
  };
}
