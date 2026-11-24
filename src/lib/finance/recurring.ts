// Assinaturas e custos fixos: próxima cobrança e custo mensal equivalente.

import { addMonths } from './dates';
import type { FinanceRecurring, RecurringCycle } from './types';

export function advanceDate(date: string, cycle: RecurringCycle): string {
  return addMonths(date, cycle === 'yearly' ? 12 : 1);
}

/** Valor mensal equivalente em centavos da moeda original (anual ÷ 12). */
export function monthlyEquivalentCents(r: Pick<FinanceRecurring, 'amount_cents' | 'cycle'>): number {
  return r.cycle === 'yearly' ? Math.round(r.amount_cents / 12) : r.amount_cents;
}

/** Ativas com cobrança até `until` (inclusive), da mais próxima para a mais distante. */
export function dueUntil(items: FinanceRecurring[], until: string): FinanceRecurring[] {
  return items
    .filter((r) => r.active && r.next_date <= until)
    .sort((a, b) => a.next_date.localeCompare(b.next_date));
}
