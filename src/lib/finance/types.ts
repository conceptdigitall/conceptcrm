// Módulo Financeiro — tipos compartilhados entre regras, armazenamento, API e telas.
// Valores sempre em centavos inteiros da moeda original (amount_cents) e em
// centavos de real (amount_brl_cents). Datas de lançamento em 'YYYY-MM-DD'.

export type FinanceKind = 'expense' | 'income';
export type RecurringCycle = 'monthly' | 'yearly';
export type RateSource = 'fixed' | 'awesomeapi' | 'frankfurter' | 'manual';

export interface FinanceCategory {
  id: string;
  name: string;
  kind: FinanceKind;
  /** Cor em hex (#rrggbb) usada nos gráficos e etiquetas. */
  color: string;
  archived: boolean;
  created_at: string;
}

export interface FinanceEntry {
  id: string;
  kind: FinanceKind;
  description: string;
  category_id: string | null;
  /** Valor na moeda original, em centavos. */
  amount_cents: number;
  /** ISO-4217, ex.: 'USD'. */
  currency: string;
  /** Data do pagamento/recebimento, 'YYYY-MM-DD'. */
  date: string;
  /** Quantos reais vale 1 unidade da moeda na data do lançamento. */
  rate_to_brl: number;
  rate_source: RateSource;
  /** Data a que a cotação se refere (pode ser o último dia útil antes de `date`). */
  rate_date: string;
  /** Estimativa em reais pela cotação (centavos). */
  amount_brl_cents: number;
  /** Valor real cobrado em reais (fatura do cartão, com IOF/spread), se informado. */
  actual_brl_cents: number | null;
  recurring_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinanceRecurring {
  id: string;
  kind: FinanceKind;
  description: string;
  category_id: string | null;
  amount_cents: number;
  currency: string;
  cycle: RecurringCycle;
  /** Próxima cobrança prevista, 'YYYY-MM-DD'. */
  next_date: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RateQuote {
  currency: string;
  /** Reais por 1 unidade da moeda. */
  rate: number;
  source: RateSource;
  /** Dia a que a cotação se refere, 'YYYY-MM-DD'. */
  date: string;
}

/** Valor em reais que conta nos totais: o real da fatura, senão a estimativa. */
export function effectiveBrlCents(e: Pick<FinanceEntry, 'amount_brl_cents' | 'actual_brl_cents'>): number {
  return e.actual_brl_cents ?? e.amount_brl_cents;
}
