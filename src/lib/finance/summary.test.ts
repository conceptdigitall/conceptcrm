import { describe, expect, it } from 'vitest';
import { buildSummary } from './summary';
import type { FinanceCategory, FinanceEntry, FinanceRecurring } from './types';

const cat = (id: string, kind: 'expense' | 'income', name = id): FinanceCategory => ({
  id, name, kind, color: '#111111', archived: false, created_at: '',
});

let seq = 0;
const entry = (p: Partial<FinanceEntry>): FinanceEntry => ({
  id: `e${seq++}`, kind: 'expense', description: 'x', category_id: null, amount_cents: 0, currency: 'BRL',
  date: '2026-11-05', rate_to_brl: 1, rate_source: 'fixed', rate_date: '2026-11-05', amount_brl_cents: 0,
  actual_brl_cents: null, recurring_id: null, notes: null, created_at: '', updated_at: '', ...p,
});

const rec = (p: Partial<FinanceRecurring>): FinanceRecurring => ({
  id: `r${seq++}`, kind: 'expense', description: 'Assinatura', category_id: null, amount_cents: 2000,
  currency: 'USD', cycle: 'monthly', next_date: '2026-11-25', active: true, notes: null, created_at: '', updated_at: '', ...p,
});

describe('buildSummary', () => {
  const categories = [cat('ads', 'expense', 'Anúncios'), cat('subs', 'expense', 'Assinaturas'), cat('sales', 'income', 'Vendas')];
  const entries = [
    entry({ kind: 'income', category_id: 'sales', amount_brl_cents: 500000 }),
    entry({ category_id: 'ads', amount_brl_cents: 100000 }),
    // Dólar: estimativa 11869, fatura real 12400 → conta o real.
    entry({ category_id: 'subs', currency: 'USD', amount_cents: 2000, amount_brl_cents: 11869, actual_brl_cents: 12400 }),
    entry({ category_id: 'ads', amount_brl_cents: 30000, date: '2026-10-10' }),
  ];

  const s = buildSummary({
    month: '2026-11',
    today: '2026-11-20',
    entries,
    categories,
    recurring: [rec({}), rec({ cycle: 'yearly', amount_cents: 120000, currency: 'BRL', next_date: '2027-05-01' }), rec({ currency: 'EUR', active: true }), rec({ active: false })],
    rates: { USD: 5.9 },
  });

  it('soma o mês usando o valor real quando existe', () => {
    expect(s.income_cents).toBe(500000);
    expect(s.expense_cents).toBe(112400);
    expect(s.balance_cents).toBe(387600);
    expect(s.previous).toEqual({ income_cents: 0, expense_cents: 30000 });
    expect(s.foreign_expense_cents).toBe(12400);
  });

  it('agrupa por categoria, maior primeiro', () => {
    expect(s.expense_by_category.map((c) => [c.name, c.total_cents])).toEqual([['Anúncios', 100000], ['Assinaturas', 12400]]);
  });

  it('monta a série dos últimos 6 meses', () => {
    expect(s.series).toHaveLength(6);
    expect(s.series[0].month).toBe('2026-06');
    expect(s.series[5]).toEqual({ month: '2026-11', income_cents: 500000, expense_cents: 112400 });
  });

  it('calcula o custo fixo mensal com a cotação de hoje e avisa a que faltou', () => {
    // US$ 20 × 5,9 = 11800 + anual R$ 1.200 / 12 = 10000. EUR sem cotação fica de fora.
    expect(s.recurring_monthly_expense_cents).toBe(21800);
    expect(s.missing_rates).toEqual(['EUR']);
    expect(s.recurring).toHaveLength(3);
    expect(s.upcoming.map((u) => u.currency)).toEqual(['USD', 'EUR']);
  });
});
