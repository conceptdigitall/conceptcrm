// Painel do Simples Nacional (referência para o contador, não é cálculo oficial).
// Regime de caixa: conta o que entrou/saiu (lançamentos), pelo valor efetivo em reais.

import { monthOf, shiftMonth } from './dates';
import { effectiveBrlCents, type FinanceEntry } from './types';

/** Soma dos lançamentos que passam no filtro nos 12 meses anteriores a `refMonth` (AAAA-MM). */
function sum12(entries: FinanceEntry[], refMonth: string, keep: (e: FinanceEntry) => boolean): number {
  const from = shiftMonth(refMonth, -12);
  const to = shiftMonth(refMonth, -1);
  return entries
    .filter((e) => {
      const m = monthOf(e.date);
      return m >= from && m <= to && keep(e);
    })
    .reduce((acc, e) => acc + effectiveBrlCents(e), 0);
}

/** Receita bruta dos 12 meses anteriores ao mês de referência (RBT12). */
export function rbt12Cents(entries: FinanceEntry[], refMonth: string): number {
  return sum12(entries, refMonth, (e) => e.kind === 'income');
}

/** Folha (pró-labore, salários e encargos) dos 12 meses anteriores: base do Fator R. */
export function payroll12Cents(entries: FinanceEntry[], refMonth: string, payrollCategoryId: string | null): number {
  if (!payrollCategoryId) return 0;
  return sum12(entries, refMonth, (e) => e.kind === 'expense' && e.category_id === payrollCategoryId);
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

/** Imposto estimado do mês: entradas × alíquota efetiva informada pelo contador. */
export function estimatedTaxCents(incomeCents: number, aliquotaPercent: number | null): number | null {
  if (aliquotaPercent === null || !Number.isFinite(aliquotaPercent)) return null;
  return Math.round((incomeCents * aliquotaPercent) / 100);
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
