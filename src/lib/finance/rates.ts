// Cotações para real. Fonte principal: AwesomeAPI (economia.awesomeapi.com.br,
// sem chave). Reserva: Frankfurter (api.frankfurter.dev, dados do BCE).
// Só roda no servidor (rotas de API); o navegador nunca chama as fontes direto.

import { addDays, todayInBrazil } from './dates';
import { BASE_CURRENCY } from './money';
import type { RateQuote } from './types';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const AWESOME = 'https://economia.awesomeapi.com.br/json';
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const TIMEOUT_MS = 6000;
const LATEST_TTL_MS = 10 * 60 * 1000;

export class RateUnavailableError extends Error {
  constructor(currency: string) {
    super(`Cotação indisponível para ${currency}`);
    this.name = 'RateUnavailableError';
  }
}

function positive(n: unknown): number | null {
  const v = typeof n === 'string' ? Number(n) : typeof n === 'number' ? n : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Resposta de /json/last/USD-BRL → cotação de compra (bid). */
export function parseAwesomeLatest(body: unknown, currency: string): RateQuote | null {
  const row = (body as Record<string, { bid?: unknown; create_date?: unknown }> | null)?.[`${currency}${BASE_CURRENCY}`];
  const rate = positive(row?.bid);
  if (!rate || typeof row?.create_date !== 'string') return null;
  return { currency, rate, source: 'awesomeapi', date: row.create_date.slice(0, 10) };
}

/**
 * Resposta de /json/daily/USD-BRL/N?start_date&end_date → a cotação mais recente
 * do dia pedido ou antes dele (fim de semana e feriado usam o último dia útil).
 */
export function parseAwesomeDaily(body: unknown, currency: string, date: string): RateQuote | null {
  if (!Array.isArray(body)) return null;
  let best: { ts: number; rate: number; day: string } | null = null;
  for (const row of body as { bid?: unknown; timestamp?: unknown }[]) {
    const rate = positive(row?.bid);
    const ts = Number(row?.timestamp);
    if (!rate || !Number.isFinite(ts)) continue;
    const day = todayInBrazil(new Date(ts * 1000));
    if (day > date) continue;
    if (!best || ts > best.ts) best = { ts, rate, day };
  }
  if (!best) return null;
  return { currency, rate: best.rate, source: 'awesomeapi', date: best.day };
}

/** Resposta da Frankfurter → { date, rates: { BRL } }. */
export function parseFrankfurter(body: unknown, currency: string): RateQuote | null {
  const b = body as { date?: unknown; rates?: Record<string, unknown> } | null;
  const rate = positive(b?.rates?.[BASE_CURRENCY]);
  if (!rate || typeof b?.date !== 'string') return null;
  return { currency, rate, source: 'frankfurter', date: b.date };
}

async function getJson(fetcher: FetchLike, url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, { signal: ctrl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const compact = (d: string) => d.replaceAll('-', '');

async function fromAwesome(fetcher: FetchLike, currency: string, date: string | null): Promise<RateQuote | null> {
  if (!date) {
    return parseAwesomeLatest(await getJson(fetcher, `${AWESOME}/last/${currency}-${BASE_CURRENCY}`), currency);
  }
  // Janela de 7 dias cobre fim de semana prolongado e feriados.
  const url = `${AWESOME}/daily/${currency}-${BASE_CURRENCY}/15?start_date=${compact(addDays(date, -7))}&end_date=${compact(date)}`;
  return parseAwesomeDaily(await getJson(fetcher, url), currency, date);
}

async function fromFrankfurter(fetcher: FetchLike, currency: string, date: string | null): Promise<RateQuote | null> {
  const url = `${FRANKFURTER}/${date ?? 'latest'}?from=${currency}&to=${BASE_CURRENCY}`;
  return parseFrankfurter(await getJson(fetcher, url), currency);
}

const cache = new Map<string, { quote: RateQuote; at: number }>();

/** Limpa o cache em memória (usado nos testes). */
export function clearRateCache(): void {
  cache.clear();
}

/**
 * Cotação de `currency` para real. `date` nulo ou de hoje/futuro = cotação atual
 * (cache de 10 min); data passada = histórica (cache sem prazo, não muda mais).
 * Lança RateUnavailableError se as duas fontes falharem.
 */
export async function getRateToBrl(
  currency: string,
  date: string | null = null,
  fetcher: FetchLike = fetch,
  now: Date = new Date(),
): Promise<RateQuote> {
  const today = todayInBrazil(now);
  if (currency === BASE_CURRENCY) return { currency, rate: 1, source: 'fixed', date: date ?? today };

  const historical = date !== null && date < today ? date : null;
  const key = `${currency}:${historical ?? 'latest'}`;
  const hit = cache.get(key);
  if (hit && (historical || now.getTime() - hit.at < LATEST_TTL_MS)) return hit.quote;

  const quote = (await fromAwesome(fetcher, currency, historical)) ?? (await fromFrankfurter(fetcher, currency, historical));
  if (!quote) throw new RateUnavailableError(currency);
  cache.set(key, { quote, at: now.getTime() });
  return quote;
}
