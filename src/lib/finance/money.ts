// Formatação e leitura de valores do módulo Financeiro (pt-BR, com centavos).
// Separado de src/lib/currency.ts, que formata valores de negócio sem centavos.

export const BASE_CURRENCY = 'BRL';

export interface FinanceCurrency {
  code: string;
  label: string;
}

/** Moedas aceitas nos lançamentos. Todas têm par com BRL na AwesomeAPI e na Frankfurter. */
export const FINANCE_CURRENCIES: FinanceCurrency[] = [
  { code: 'BRL', label: 'Real' },
  { code: 'USD', label: 'Dólar americano' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'Libra esterlina' },
  { code: 'CAD', label: 'Dólar canadense' },
  { code: 'AUD', label: 'Dólar australiano' },
  { code: 'CHF', label: 'Franco suíço' },
  { code: 'JPY', label: 'Iene' },
  { code: 'CNY', label: 'Yuan' },
];

export function isFinanceCurrency(code: unknown): code is string {
  return typeof code === 'string' && FINANCE_CURRENCIES.some((c) => c.code === code);
}

/** 12345 + 'USD' → "US$ 123,45". Nunca lança: código inválido vira "XYZ 123,45". */
export function formatMoney(cents: number, currency: string = BASE_CURRENCY): string {
  const value = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  }
}

/** Taxa com 4 casas: 5.93461 → "5,9346". */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(rate);
}

/**
 * Lê o que a pessoa digitou e devolve centavos, ou null se não for um valor.
 * Aceita "1.234,56", "1234,56", "1234.56", "1,234.56", "R$ 20" e "20".
 * A última vírgula ou ponto seguido de 1–2 dígitos é a casa decimal.
 */
export function parseMoneyInput(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : null;
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[^\d.,-]/g, '');
  if (!s || s.includes('-')) return null;
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  const intPart = (m ? m[1] : s).replace(/[.,]/g, '');
  const decPart = m ? m[2].padEnd(2, '0') : '00';
  if (!/^\d*$/.test(intPart) || (intPart === '' && !m)) return null;
  const cents = Number(intPart || '0') * 100 + Number(decPart);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Converte centavos da moeda original em centavos de real. */
export function toBrlCents(amountCents: number, rateToBrl: number): number {
  return Math.round(amountCents * rateToBrl);
}
