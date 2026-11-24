// Retirada de lucros: quanto tirar para os sócios e quanto cabe a cada um.
// Divisão em centavos inteiros; o resto (1 ou 2 centavos) vai para os primeiros,
// para que a soma das partes seja exatamente o total.

export type ProfitBase = 'balance' | 'income';

export interface ProfitSplitInput {
  /** Sobra do mês (entradas − gastos) em centavos. */
  balanceCents: number;
  /** Entradas do mês em centavos. */
  incomeCents: number;
  base: ProfitBase;
  /** 0–100; aceita decimais (ex.: 12,5). */
  percent: number;
  /** Quantas pessoas dividem (1–20). */
  people: number;
}

export interface ProfitSplit {
  baseCents: number;
  percent: number;
  people: number;
  totalCents: number;
  shares: number[];
  /** Quanto da sobra continua na empresa depois da retirada. */
  remainingBalanceCents: number;
  /** true se a retirada passa da sobra (só possível com base = entradas). */
  exceedsBalance: boolean;
}

export const clampPercent = (p: number) =>
  Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0;
export const clampPeople = (n: number) =>
  Number.isFinite(n) ? Math.min(20, Math.max(1, Math.round(n))) : 1;

export function splitProfit(input: ProfitSplitInput): ProfitSplit {
  const percent = clampPercent(input.percent);
  const people = clampPeople(input.people);
  const baseCents = Math.max(
    0,
    input.base === 'income' ? input.incomeCents : input.balanceCents
  );
  const totalCents = Math.floor((baseCents * percent) / 100);
  const each = Math.floor(totalCents / people);
  const rest = totalCents - each * people;
  const shares = Array.from(
    { length: people },
    (_, i) => each + (i < rest ? 1 : 0)
  );
  return {
    baseCents,
    percent,
    people,
    totalCents,
    shares,
    remainingBalanceCents: input.balanceCents - totalCents,
    exceedsBalance: totalCents > Math.max(0, input.balanceCents),
  };
}
