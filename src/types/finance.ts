export type FinanceKind = 'receita' | 'despesa';
export type FinanceStatus = 'pendente' | 'pago' | 'cancelado';

export interface FinanceEntry {
  id: string;
  account_id: string;
  kind: FinanceKind;
  category: string;
  description: string;
  amount_cents: number;
  due_date: string; // YYYY-MM-DD
  paid_at: string | null;
  status: FinanceStatus;
  contact_id: string | null;
  contract_id: string | null;
  source: 'manual' | 'contrato';
  reference_month: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contact?: { id: string; name: string | null; company: string | null } | null;
}

export interface FinanceEntryForm {
  kind: FinanceKind;
  category: string;
  description: string;
  amount_cents: number;
  due_date: string;
  contact_id?: string | null;
  notes?: string;
  paid?: boolean;
}

export interface FinanceSettings {
  account_id: string;
  simples_aliquota_percent: number | null;
  notes: string | null;
}

export const REVENUE_CATEGORIES = ['mensalidade', 'setup', 'projeto', 'outros'] as const;
// "folha" entra no cálculo do Fator R (pró-labore, salários e encargos).
export const EXPENSE_CATEGORIES = [
  'folha',
  'ferramentas',
  'infraestrutura',
  'marketing',
  'impostos',
  'outros',
] as const;
