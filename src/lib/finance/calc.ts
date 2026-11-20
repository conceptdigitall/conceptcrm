import type { FinanceEntry } from '@/types/finance';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (cents: number): string => brl.format(cents / 100);

/** AAAA-MM de uma data (AAAA-MM-DD) ou timestamp ISO. */
export const monthKey = (value: string): string => value.slice(0, 7);

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Pendente com vencimento antes de hoje (hoje = AAAA-MM-DD). */
export function isOverdue(e: FinanceEntry, today: string): boolean {
  return e.status === 'pendente' && e.due_date < today;
}

export interface MonthSummary {
  receivedCents: number;
  receivableCents: number;
  overdueCents: number;
  expensesPaidCents: number;
  expensesPendingCents: number;
  profitCents: number;
}

/** Resumo por competência (mês do vencimento). Cancelados não entram. */
export function summarizeMonth(entries: FinanceEntry[], month: string, today: string): MonthSummary {
  const s: MonthSummary = {
    receivedCents: 0, receivableCents: 0, overdueCents: 0,
    expensesPaidCents: 0, expensesPendingCents: 0, profitCents: 0,
  };
  for (const e of entries) {
    if (e.status === 'cancelado' || monthKey(e.due_date) !== month) continue;
    if (e.kind === 'receita') {
      if (e.status === 'pago') s.receivedCents += e.amount_cents;
      else {
        s.receivableCents += e.amount_cents;
        if (isOverdue(e, today)) s.overdueCents += e.amount_cents;
      }
    } else if (e.status === 'pago') s.expensesPaidCents += e.amount_cents;
    else s.expensesPendingCents += e.amount_cents;
  }
  s.profitCents = s.receivedCents - s.expensesPaidCents;
  return s;
}

interface ContractLike {
  type: string;
  status: string;
  monthly_price: number | string;
}

/** Receita recorrente mensal: contratos recorrentes assinados (preço em reais). */
export function mrrCents(contracts: ContractLike[]): number {
  return contracts
    .filter((c) => c.type === 'recorrente' && c.status === 'assinado')
    .reduce((acc, c) => acc + Math.round((Number(c.monthly_price) || 0) * 100), 0);
}

export interface SeriesPoint {
  month: string;
  revenueCents: number;
  expenseCents: number;
}

/** Realizado (pago) por mês de pagamento, `count` meses terminando em `endMonth`. */
export function monthlySeries(entries: FinanceEntry[], endMonth: string, count: number): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    points.push({ month: addMonths(endMonth, -i), revenueCents: 0, expenseCents: 0 });
  }
  const byMonth = new Map(points.map((p) => [p.month, p]));
  for (const e of entries) {
    if (e.status !== 'pago' || !e.paid_at) continue;
    const p = byMonth.get(monthKey(e.paid_at));
    if (!p) continue;
    if (e.kind === 'receita') p.revenueCents += e.amount_cents;
    else p.expenseCents += e.amount_cents;
  }
  return points;
}

/** Receita bruta dos 12 meses anteriores ao mês de referência (regime de caixa: receitas pagas). */
export function rbt12Cents(entries: FinanceEntry[], refMonth: string): number {
  const from = addMonths(refMonth, -12);
  const to = addMonths(refMonth, -1);
  return entries
    .filter((e) => e.kind === 'receita' && e.status === 'pago' && e.paid_at)
    .filter((e) => {
      const m = monthKey(e.paid_at as string);
      return m >= from && m <= to;
    })
    .reduce((acc, e) => acc + e.amount_cents, 0);
}

/** Folha (pró-labore, salários e encargos) paga nos 12 meses anteriores: base do Fator R. */
export function payroll12Cents(entries: FinanceEntry[], refMonth: string): number {
  const from = addMonths(refMonth, -12);
  const to = addMonths(refMonth, -1);
  return entries
    .filter((e) => e.kind === 'despesa' && e.category === 'folha' && e.status === 'pago' && e.paid_at)
    .filter((e) => {
      const m = monthKey(e.paid_at as string);
      return m >= from && m <= to;
    })
    .reduce((acc, e) => acc + e.amount_cents, 0);
}

export interface FatorRResult {
  ratio: number | null;
  anexo: 'III' | 'V' | null;
}

/** Fator R (LC 123/2006): folha ÷ receita ≥ 28% → Anexo III; abaixo → Anexo V. */
export function fatorR(payrollCents: number, revenueCents: number): FatorRResult {
  if (revenueCents <= 0) return { ratio: null, anexo: null };
  // Comparação em inteiros para evitar erro de ponto flutuante no limite de 28%.
  const atinge = payrollCents * 100 >= revenueCents * 28;
  return { ratio: payrollCents / revenueCents, anexo: atinge ? 'III' : 'V' };
}

function csvText(value: string): string {
  // Evita injeção de fórmula ao abrir no Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;,"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV para o contador: separador ";" e vírgula decimal (padrão pt-BR). */
export function toCsv(entries: FinanceEntry[]): string {
  const rows = entries.map((e) =>
    [
      e.due_date,
      e.kind,
      csvText(e.category),
      csvText(e.description),
      (e.amount_cents / 100).toFixed(2).replace('.', ','),
      e.status,
      e.paid_at ? e.paid_at.slice(0, 10) : '',
    ].join(';'),
  );
  return ['vencimento;tipo;categoria;descricao;valor;status;pago_em', ...rows].join('\n');
}
