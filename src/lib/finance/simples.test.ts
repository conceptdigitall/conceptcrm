import { describe, expect, it } from 'vitest';

import { entriesToCsv } from './csv';
import { estimatedTaxCents, fatorR, mrrCents, payroll12Cents, rbt12Cents } from './simples';
import type { FinanceCategory, FinanceEntry } from './types';

function entry(p: Partial<FinanceEntry>): FinanceEntry {
  return {
    id: 'e', kind: 'income', description: 'x', category_id: null, amount_cents: 100, currency: 'BRL',
    date: '2026-05-10', rate_to_brl: 1, rate_source: 'fixed', rate_date: '2026-05-10',
    amount_brl_cents: 100, actual_brl_cents: null, recurring_id: null, notes: null,
    created_at: '', updated_at: '', ...p,
  };
}

describe('rbt12Cents', () => {
  it('soma entradas dos 12 meses anteriores ao mês, sem incluir o próprio mês', () => {
    const entries = [
      entry({ date: '2025-10-31', amount_brl_cents: 1 }), // fora (13 meses antes)
      entry({ date: '2025-11-01', amount_brl_cents: 10 }),
      entry({ date: '2026-10-31', amount_brl_cents: 100 }),
      entry({ date: '2026-11-05', amount_brl_cents: 1000 }), // mês de referência
      entry({ date: '2026-06-01', kind: 'expense', amount_brl_cents: 5000 }),
    ];
    expect(rbt12Cents(entries, '2026-11')).toBe(110);
  });

  it('usa o valor real da fatura quando existe', () => {
    expect(rbt12Cents([entry({ amount_brl_cents: 100, actual_brl_cents: 120 })], '2026-06')).toBe(120);
  });
});

describe('payroll12Cents', () => {
  const entries = [
    entry({ kind: 'expense', category_id: 'folha', amount_brl_cents: 300 }),
    entry({ kind: 'expense', category_id: 'outra', amount_brl_cents: 999 }),
  ];
  it('soma só a categoria de folha', () => expect(payroll12Cents(entries, '2026-06', 'folha')).toBe(300));
  it('sem categoria configurada é zero', () => expect(payroll12Cents(entries, '2026-06', null)).toBe(0));
});

describe('fatorR', () => {
  it('28% exatos ficam no Anexo III', () => expect(fatorR(28, 100)).toEqual({ ratio: 0.28, anexo: 'III' }));
  it('abaixo de 28% vai para o Anexo V', () => expect(fatorR(27, 100).anexo).toBe('V'));
  it('sem receita não calcula', () => expect(fatorR(10, 0)).toEqual({ ratio: null, anexo: null }));
});

describe('estimatedTaxCents', () => {
  it('aplica a alíquota', () => expect(estimatedTaxCents(10000, 6)).toBe(600));
  it('sem alíquota devolve null', () => expect(estimatedTaxCents(10000, null)).toBeNull());
});

describe('mrrCents', () => {
  it('soma só recorrentes assinados', () => {
    expect(
      mrrCents([
        { type: 'recorrente', status: 'assinado', monthly_price: '450.50' },
        { type: 'recorrente', status: 'enviado', monthly_price: 999 },
        { type: 'avulso', status: 'assinado', monthly_price: 999 },
      ]),
    ).toBe(45050);
  });
});

describe('entriesToCsv', () => {
  it('gera ; e vírgula decimal, e neutraliza fórmula', () => {
    const cats: FinanceCategory[] = [{ id: 'c', name: 'Vendas', kind: 'income', color: '#000000', archived: false, created_at: '' }];
    const csv = entriesToCsv([entry({ description: '=HYPERLINK(1)', category_id: 'c', amount_cents: 12345, amount_brl_cents: 12345 })], cats);
    expect(csv.split('\n')[1]).toBe("2026-05-10;entrada;Vendas;'=HYPERLINK(1);BRL;123,45;1;123,45");
  });
});
