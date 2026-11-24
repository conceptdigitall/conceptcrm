// Cobranças mensais dos contratos recorrentes (tabela finance_receivables) e
// configuração do painel do Simples (finance_settings). Só existem com Supabase.
// Marcar como paga cria um lançamento de entrada em real; reabrir apaga esse lançamento.

import type { SupabaseClient } from '@supabase/supabase-js';

import { monthRange } from './dates';
import type { FinanceRepository } from './repository';
import { createEntry, FinanceInputError } from './service';
import { FinanceStorageError } from './supabase-repository';

export type ReceivableStatus = 'pendente' | 'pago' | 'cancelado';

export interface FinanceReceivable {
  id: string;
  contract_id: string | null;
  contact_id: string | null;
  description: string;
  amount_cents: number;
  reference_month: string;
  due_date: string;
  status: ReceivableStatus;
  paid_date: string | null;
  entry_id: string | null;
  contact: { id: string; name: string | null; company: string | null } | null;
}

export interface FinanceSettings {
  simples_aliquota_percent: number | null;
  payroll_category_id: string | null;
}

/** Categoria de entrada usada nas mensalidades pagas, se existir. */
export const RECEIVABLE_CATEGORY_NAME = 'Mensalidades de clientes';

const COLS =
  'id, contract_id, contact_id, description, amount_cents, reference_month, due_date, status, paid_date, entry_id, contact:contacts (id, name, company)';

const toReceivable = (r: Record<string, unknown>): FinanceReceivable => ({
  ...(r as unknown as FinanceReceivable),
  amount_cents: Number(r.amount_cents),
  contact: (Array.isArray(r.contact) ? r.contact[0] : r.contact) as FinanceReceivable['contact'],
});

export function createReceivablesStore(db: SupabaseClient, accountId: string) {
  async function get(id: string): Promise<FinanceReceivable | null> {
    const { data, error } = await db.from('finance_receivables').select(COLS).eq('account_id', accountId).eq('id', id).maybeSingle();
    if (error) throw new FinanceStorageError('ler cobrança', error.message);
    return data ? toReceivable(data) : null;
  }

  async function patch(id: string, fields: Record<string, unknown>): Promise<FinanceReceivable> {
    const { data, error } = await db
      .from('finance_receivables')
      .update(fields)
      .eq('account_id', accountId)
      .eq('id', id)
      .select(COLS)
      .single();
    if (error) throw new FinanceStorageError('atualizar cobrança', error.message);
    return toReceivable(data);
  }

  return {
    get,

    async list(month: string): Promise<FinanceReceivable[]> {
      const { from } = monthRange(month);
      const { data, error } = await db
        .from('finance_receivables')
        .select(COLS)
        .eq('account_id', accountId)
        .eq('reference_month', from)
        .order('due_date', { ascending: true });
      if (error) throw new FinanceStorageError('listar cobranças', error.message);
      return (data ?? []).map(toReceivable);
    },

    /** Gera as cobranças do mês a partir dos contratos. Devolve quantas foram criadas. */
    async generate(month: string): Promise<number> {
      const { data, error } = await db.rpc('generate_contract_receivables', {
        p_account_id: accountId,
        p_month: monthRange(month).from,
      });
      if (error) throw new FinanceStorageError('gerar cobranças', error.message);
      return Number(data) || 0;
    },

    async pay(repo: FinanceRepository, id: string, date: string): Promise<FinanceReceivable> {
      const rec = await get(id);
      if (!rec) throw new FinanceInputError('Cobrança não encontrada');
      if (rec.status !== 'pendente') throw new FinanceInputError('Só cobranças pendentes podem ser pagas');
      const category = (await repo.listCategories()).find(
        (c) => c.kind === 'income' && !c.archived && c.name === RECEIVABLE_CATEGORY_NAME,
      );
      const entry = await createEntry(repo, {
        kind: 'income',
        description: rec.description,
        category_id: category?.id ?? null,
        amount_cents: rec.amount_cents,
        currency: 'BRL',
        date,
        notes: null,
      });
      try {
        return await patch(id, { status: 'pago', paid_date: date, entry_id: entry.id });
      } catch (err) {
        await repo.deleteEntry(entry.id).catch(() => undefined);
        throw err;
      }
    },

    async reopen(repo: FinanceRepository, id: string): Promise<FinanceReceivable> {
      const rec = await get(id);
      if (!rec) throw new FinanceInputError('Cobrança não encontrada');
      if (rec.status === 'pendente') return rec;
      const updated = await patch(id, { status: 'pendente', paid_date: null, entry_id: null });
      if (rec.entry_id) await repo.deleteEntry(rec.entry_id);
      return updated;
    },

    async cancel(id: string): Promise<FinanceReceivable> {
      const rec = await get(id);
      if (!rec) throw new FinanceInputError('Cobrança não encontrada');
      if (rec.status !== 'pendente') throw new FinanceInputError('Reabra a cobrança antes de cancelar');
      return patch(id, { status: 'cancelado' });
    },

    async contracts(): Promise<{ type: string; status: string; monthly_price: number | string }[]> {
      const { data, error } = await db.from('client_contracts').select('type, status, monthly_price').eq('account_id', accountId);
      if (error) throw new FinanceStorageError('listar contratos', error.message);
      return data ?? [];
    },

    async settings(): Promise<FinanceSettings> {
      const { data, error } = await db
        .from('finance_settings')
        .select('simples_aliquota_percent, payroll_category_id')
        .eq('account_id', accountId)
        .maybeSingle();
      if (error) throw new FinanceStorageError('ler configurações', error.message);
      return {
        simples_aliquota_percent: data?.simples_aliquota_percent == null ? null : Number(data.simples_aliquota_percent),
        payroll_category_id: data?.payroll_category_id ?? null,
      };
    },

    async saveSettings(s: FinanceSettings): Promise<void> {
      const { error } = await db
        .from('finance_settings')
        .upsert({ account_id: accountId, ...s, updated_at: new Date().toISOString() }, { onConflict: 'account_id' });
      if (error) throw new FinanceStorageError('salvar configurações', error.message);
    },
  };
}

export type ReceivablesStore = ReturnType<typeof createReceivablesStore>;
