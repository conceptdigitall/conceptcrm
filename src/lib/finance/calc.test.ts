import { describe, expect, it } from 'vitest';
import type { FinanceEntry } from '@/types/finance';
import {
  fatorR,
  formatBRL,
  isOverdue,
  monthKey,
  monthlySeries,
  mrrCents,
  payroll12Cents,
  rbt12Cents,
  summarizeMonth,
  toCsv,
} from './calc';

let n = 0;
function entry(p: Partial<FinanceEntry>): FinanceEntry {
  n += 1;
  return {
    id: `e${n}`, account_id: 'a', kind: 'receita', category: 'outros', description: 'x',
    amount_cents: 1000, due_date: '2026-11-10', paid_at: null, status: 'pendente',
    contact_id: null, contract_id: null, source: 'manual', reference_month: null,
    notes: null, created_at: '', updated_at: '', ...p,
  };
}
const paid = (p: Partial<FinanceEntry>) =>
  entry({ status: 'pago', paid_at: `${p.due_date ?? '2026-11-10'}T12:00:00-03:00`, ...p });

describe('formatBRL', () => {
  it('formata centavos em reais', () => {
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});

describe('isOverdue', () => {
  it('pendente vencido é atrasado; pago e cancelado nunca', () => {
    expect(isOverdue(entry({ due_date: '2026-11-09' }), '2026-11-10')).toBe(true);
    expect(isOverdue(entry({ due_date: '2026-11-10' }), '2026-11-10')).toBe(false);
    expect(isOverdue(paid({ due_date: '2026-10-01' }), '2026-11-10')).toBe(false);
    expect(isOverdue(entry({ due_date: '2026-10-01', status: 'cancelado' }), '2026-11-10')).toBe(false);
  });
});

describe('summarizeMonth', () => {
  const entries = [
    paid({ amount_cents: 50000, due_date: '2026-11-05' }),
    entry({ amount_cents: 30000, due_date: '2026-11-20' }), // a receber
    entry({ amount_cents: 20000, due_date: '2026-11-02' }), // atrasado
    paid({ kind: 'despesa', amount_cents: 12000, due_date: '2026-11-03' }),
    entry({ kind: 'despesa', amount_cents: 8000, due_date: '2026-11-25' }),
    entry({ amount_cents: 99999, due_date: '2026-11-15', status: 'cancelado' }),
    paid({ amount_cents: 77777, due_date: '2026-10-15' }), // outro mês
  ];
  it('separa recebido, a receber, atrasado, despesas e lucro do mês', () => {
    expect(summarizeMonth(entries, '2026-11', '2026-11-10')).toEqual({
      receivedCents: 50000,
      receivableCents: 50000,
      overdueCents: 20000,
      expensesPaidCents: 12000,
      expensesPendingCents: 8000,
      profitCents: 38000,
    });
  });
});

describe('mrrCents', () => {
  it('soma só contratos recorrentes assinados', () => {
    expect(
      mrrCents([
        { type: 'recorrente', status: 'assinado', monthly_price: 290 },
        { type: 'recorrente', status: 'rascunho', monthly_price: 490 },
        { type: 'avulso', status: 'assinado', monthly_price: 100 },
        { type: 'recorrente', status: 'assinado', monthly_price: 197.5 },
      ]),
    ).toBe(48750);
  });
});

describe('monthlySeries', () => {
  it('devolve N meses terminando no mês dado, pelo mês do pagamento', () => {
    const s = monthlySeries(
      [paid({ amount_cents: 500, due_date: '2026-11-05' }), paid({ kind: 'despesa', amount_cents: 200, due_date: '2026-10-05' })],
      '2026-11',
      3,
    );
    expect(s.map((x) => x.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(s[1]).toMatchObject({ revenueCents: 0, expenseCents: 200 });
    expect(s[2]).toMatchObject({ revenueCents: 500, expenseCents: 0 });
  });
});

describe('rbt12Cents', () => {
  it('soma receitas pagas dos 12 meses anteriores ao mês de referência', () => {
    const e = [
      paid({ amount_cents: 100, due_date: '2025-11-15' }), // dentro (12 meses antes)
      paid({ amount_cents: 200, due_date: '2026-10-31' }), // dentro
      paid({ amount_cents: 400, due_date: '2025-10-31' }), // fora (13 meses)
      paid({ amount_cents: 800, due_date: '2026-11-02' }), // mês de referência não entra
      paid({ kind: 'despesa', amount_cents: 1600, due_date: '2026-06-01' }),
    ];
    expect(rbt12Cents(e, '2026-11')).toBe(300);
  });
});

describe('payroll12Cents', () => {
  it('soma só despesas pagas da categoria folha nos 12 meses anteriores', () => {
    const e = [
      paid({ kind: 'despesa', category: 'folha', amount_cents: 300, due_date: '2026-09-05' }),
      paid({ kind: 'despesa', category: 'ferramentas', amount_cents: 999, due_date: '2026-09-05' }),
      entry({ kind: 'despesa', category: 'folha', amount_cents: 500, due_date: '2026-09-05' }),
      paid({ kind: 'despesa', category: 'folha', amount_cents: 700, due_date: '2026-11-05' }),
    ];
    expect(payroll12Cents(e, '2026-11')).toBe(300);
  });
});

describe('fatorR', () => {
  it('28% ou mais = Anexo III; menos = Anexo V', () => {
    expect(fatorR(28_000, 100_000)).toMatchObject({ ratio: 0.28, anexo: 'III' });
    expect(fatorR(27_999, 100_000)).toMatchObject({ anexo: 'V' });
  });
  it('sem receita não define anexo', () => {
    expect(fatorR(1000, 0)).toEqual({ ratio: null, anexo: null });
  });
});

describe('monthKey', () => {
  it('pega AAAA-MM de datas e timestamps', () => {
    expect(monthKey('2026-11-30')).toBe('2026-11');
    expect(monthKey('2026-12-01T02:00:00Z')).toBe('2026-12');
  });
});

describe('toCsv', () => {
  it('escapa aspas e vírgulas e usa vírgula decimal', () => {
    const csv = toCsv([entry({ description: 'Site, "novo"', amount_cents: 12345, category: 'projeto' })]);
    const [head, row] = csv.split('\n');
    expect(head).toBe('vencimento;tipo;categoria;descricao;valor;status;pago_em');
    expect(row).toBe('2026-11-10;receita;projeto;"Site, ""novo""";123,45;pendente;');
  });
});
