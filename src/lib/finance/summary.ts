// Totais do painel, calculados no servidor a partir dos lançamentos gravados.
// Função pura: recebe os dados e as cotações atuais, devolve os números prontos.

import { addDays, monthOf, shiftMonth } from './dates';
import { BASE_CURRENCY, toBrlCents } from './money';
import { dueUntil, monthlyEquivalentCents } from './recurring';
import { effectiveBrlCents, type FinanceCategory, type FinanceEntry, type FinanceKind, type FinanceRecurring } from './types';

export interface CategoryTotal {
  category_id: string | null;
  name: string;
  color: string;
  total_cents: number;
  count: number;
}

export interface MonthPoint {
  month: string;
  income_cents: number;
  expense_cents: number;
}

export interface RecurringLine {
  id: string;
  description: string;
  kind: FinanceKind;
  currency: string;
  next_date: string;
  /** Mensal equivalente na moeda original. */
  monthly_cents: number;
  /** Mensal equivalente em reais pela cotação de hoje; null se a cotação faltou. */
  monthly_brl_cents: number | null;
}

export interface FinanceSummary {
  month: string;
  income_cents: number;
  expense_cents: number;
  balance_cents: number;
  previous: { income_cents: number; expense_cents: number };
  /** Parte das saídas do mês paga em moeda estrangeira (em reais). */
  foreign_expense_cents: number;
  expense_by_category: CategoryTotal[];
  income_by_category: CategoryTotal[];
  series: MonthPoint[];
  recurring_monthly_expense_cents: number;
  recurring_monthly_income_cents: number;
  recurring: RecurringLine[];
  upcoming: RecurringLine[];
  missing_rates: string[];
}

const UNCATEGORIZED = { name: 'Sem categoria', color: '#94a3b8' };

function totalsFor(entries: FinanceEntry[], month: string) {
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (monthOf(e.date) !== month) continue;
    if (e.kind === 'income') income += effectiveBrlCents(e);
    else expense += effectiveBrlCents(e);
  }
  return { income_cents: income, expense_cents: expense };
}

function byCategory(entries: FinanceEntry[], kind: FinanceKind, cats: Map<string, FinanceCategory>): CategoryTotal[] {
  const acc = new Map<string, CategoryTotal>();
  for (const e of entries) {
    if (e.kind !== kind) continue;
    const key = e.category_id ?? '';
    const cat = e.category_id ? cats.get(e.category_id) : undefined;
    const row = acc.get(key) ?? {
      category_id: e.category_id,
      name: cat?.name ?? UNCATEGORIZED.name,
      color: cat?.color ?? UNCATEGORIZED.color,
      total_cents: 0,
      count: 0,
    };
    row.total_cents += effectiveBrlCents(e);
    row.count += 1;
    acc.set(key, row);
  }
  return [...acc.values()].sort((a, b) => b.total_cents - a.total_cents);
}

export interface SummaryInput {
  month: string;
  today: string;
  entries: FinanceEntry[];
  categories: FinanceCategory[];
  recurring: FinanceRecurring[];
  /** Cotação atual por moeda (reais por unidade). Moeda ausente = cotação indisponível. */
  rates: Record<string, number>;
  /** Quantos meses no gráfico de evolução (inclui o mês escolhido). */
  seriesMonths?: number;
}

export function buildSummary(input: SummaryInput): FinanceSummary {
  const { month, today, entries, categories, recurring, rates } = input;
  const cats = new Map(categories.map((c) => [c.id, c]));
  const monthEntries = entries.filter((e) => monthOf(e.date) === month);
  const current = totalsFor(entries, month);
  const previous = totalsFor(entries, shiftMonth(month, -1));

  const n = input.seriesMonths ?? 6;
  const series: MonthPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = shiftMonth(month, -i);
    series.push({ month: m, ...totalsFor(entries, m) });
  }

  const missing = new Set<string>();
  const lines: RecurringLine[] = recurring
    .filter((r) => r.active)
    .map((r) => {
      const monthly = monthlyEquivalentCents(r);
      const rate = r.currency === BASE_CURRENCY ? 1 : rates[r.currency];
      if (!rate) missing.add(r.currency);
      return {
        id: r.id,
        description: r.description,
        kind: r.kind,
        currency: r.currency,
        next_date: r.next_date,
        monthly_cents: monthly,
        monthly_brl_cents: rate ? toBrlCents(monthly, rate) : null,
      };
    })
    .sort((a, b) => (b.monthly_brl_cents ?? 0) - (a.monthly_brl_cents ?? 0));

  const sumKind = (kind: FinanceKind) =>
    lines.filter((l) => l.kind === kind).reduce((s, l) => s + (l.monthly_brl_cents ?? 0), 0);
  const upcomingIds = new Set(dueUntil(recurring, addDays(today, 30)).map((r) => r.id));

  return {
    month,
    ...current,
    balance_cents: current.income_cents - current.expense_cents,
    previous,
    foreign_expense_cents: monthEntries
      .filter((e) => e.kind === 'expense' && e.currency !== BASE_CURRENCY)
      .reduce((s, e) => s + effectiveBrlCents(e), 0),
    expense_by_category: byCategory(monthEntries, 'expense', cats),
    income_by_category: byCategory(monthEntries, 'income', cats),
    series,
    recurring_monthly_expense_cents: sumKind('expense'),
    recurring_monthly_income_cents: sumKind('income'),
    recurring: lines,
    upcoming: lines.filter((l) => upcomingIds.has(l.id)).sort((a, b) => a.next_date.localeCompare(b.next_date)),
    missing_rates: [...missing].sort(),
  };
}
