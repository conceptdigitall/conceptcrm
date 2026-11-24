// Chamadas do navegador para /api/financeiro. Toda resposta não-OK vira Error
// com a mensagem que a rota mandou, para o toast mostrar algo útil.

import type { FinanceReceivable, FinanceSettings } from '@/lib/finance/receivables';
import type { FatorRResult } from '@/lib/finance/simples';
import type { FinanceSummary } from '@/lib/finance/summary';
import type {
  FinanceCategory,
  FinanceEntry,
  FinanceRecurring,
  RateQuote,
} from '@/lib/finance/types';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof body?.error === 'string' && body.error !== 'not_found'
        ? body.error
        : 'Não foi possível concluir a operação';
    throw new Error(msg);
  }
  return body as T;
}

const send = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

export type EntryForm = {
  kind: 'expense' | 'income';
  description: string;
  category_id: string | null;
  amount: string;
  currency: string;
  date: string;
  manual_rate: string | null;
  actual_brl: string | null;
  notes: string | null;
};

export type RecurringForm = {
  kind: 'expense' | 'income';
  description: string;
  category_id: string | null;
  amount: string;
  currency: string;
  cycle: 'monthly' | 'yearly';
  next_date: string;
  notes: string | null;
};

/** Entrada de pagamento único; a cobrança mensal só vai se has_monthly for true. */
export type OneTimeForm = Omit<RecurringForm, 'cycle'> & {
  kind: 'income';
  cycle: 'once';
  has_monthly: boolean;
  monthly_amount: string | null;
  monthly_start: string | null;
};

export type SimplesPanel = {
  month: string;
  rbt12_cents: number;
  payroll12_cents: number;
  fator_r: FatorRResult;
  month_income_cents: number;
  estimated_tax_cents: number | null;
  mrr_cents: number;
  settings: FinanceSettings;
};

export const financeApi = {
  summary: (month: string) =>
    call<{ summary: FinanceSummary }>(
      `/api/financeiro/summary?month=${month}`
    ).then((r) => r.summary),

  categories: () =>
    call<{ categories: FinanceCategory[] }>('/api/financeiro/categories').then(
      (r) => r.categories
    ),
  createCategory: (data: { name: string; kind: string; color: string }) =>
    call<{ category: FinanceCategory }>(
      '/api/financeiro/categories',
      send('POST', data)
    ),
  updateCategory: (
    id: string,
    data: Partial<{
      name: string;
      kind: string;
      color: string;
      archived: boolean;
    }>
  ) =>
    call<{ category: FinanceCategory }>(
      `/api/financeiro/categories/${id}`,
      send('PATCH', data)
    ),
  deleteCategory: (id: string) =>
    call<{ ok: true }>(`/api/financeiro/categories/${id}`, send('DELETE')),

  entries: (month: string) =>
    call<{ entries: FinanceEntry[] }>(
      `/api/financeiro/entries?month=${month}`
    ).then((r) => r.entries),
  createEntry: (data: EntryForm) =>
    call<{ entry: FinanceEntry }>(
      '/api/financeiro/entries',
      send('POST', data)
    ),
  updateEntry: (id: string, data: Partial<EntryForm>) =>
    call<{ entry: FinanceEntry }>(
      `/api/financeiro/entries/${id}`,
      send('PATCH', data)
    ),
  deleteEntry: (id: string) =>
    call<{ ok: true }>(`/api/financeiro/entries/${id}`, send('DELETE')),

  recurring: () =>
    call<{ recurring: FinanceRecurring[] }>('/api/financeiro/recurring').then(
      (r) => r.recurring
    ),
  createRecurring: (data: RecurringForm) =>
    call<{ recurring: FinanceRecurring }>(
      '/api/financeiro/recurring',
      send('POST', data)
    ),
  createOneTime: (data: OneTimeForm) =>
    call<{ entry: FinanceEntry; recurring: FinanceRecurring | null }>(
      '/api/financeiro/recurring',
      send('POST', data)
    ),
  updateRecurring: (
    id: string,
    data: Partial<RecurringForm> & { active?: boolean }
  ) =>
    call<{ recurring: FinanceRecurring }>(
      `/api/financeiro/recurring/${id}`,
      send('PATCH', data)
    ),
  deleteRecurring: (id: string) =>
    call<{ ok: true }>(`/api/financeiro/recurring/${id}`, send('DELETE')),
  chargeRecurring: (
    id: string,
    data: { date?: string; actual_brl?: string | null } = {}
  ) =>
    call<{ entry: FinanceEntry; recurring: FinanceRecurring }>(
      `/api/financeiro/recurring/${id}/charge`,
      send('POST', data)
    ),

  rates: (currencies: string[], date?: string) => {
    const qs = new URLSearchParams({ currencies: currencies.join(',') });
    if (date) qs.set('date', date);
    return call<{ rates: RateQuote[]; unavailable: string[] }>(
      `/api/financeiro/rates?${qs}`
    );
  },

  receivables: (month: string) =>
    call<{ receivables: FinanceReceivable[]; contracts_count: number }>(
      `/api/financeiro/receivables?month=${month}`
    ),
  generateReceivables: (month: string) =>
    call<{ created: number }>('/api/financeiro/receivables', send('POST', { month })).then((r) => r.created),
  receivableAction: (id: string, action: 'pay' | 'reopen' | 'cancel', date?: string) =>
    call<{ receivable: FinanceReceivable }>(
      `/api/financeiro/receivables/${id}`,
      send('PATCH', { action, date })
    ),

  simples: (month: string) =>
    call<{ simples: SimplesPanel }>(`/api/financeiro/simples?month=${month}`).then((r) => r.simples),
  saveSimplesSettings: (data: { aliquota: string | null; payroll_category_id: string | null }) =>
    call<{ ok: true }>('/api/financeiro/simples', send('PUT', data)),
};
