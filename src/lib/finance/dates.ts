// Datas do módulo Financeiro: sempre strings 'YYYY-MM-DD' no fuso de São Paulo,
// para que "hoje" e "este mês" não virem no horário UTC do servidor.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isMonthKey(s: unknown): s is string {
  return typeof s === 'string' && MONTH_RE.test(s) && Number(s.slice(5)) >= 1 && Number(s.slice(5)) <= 12;
}

/** Hoje em São Paulo, 'YYYY-MM-DD'. */
export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Soma meses mantendo o dia, preso ao fim do mês: 31/01 + 1 → 28/02 (ou 29). */
export function addMonths(date: string, n: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM' deslocado n meses. */
export function shiftMonth(month: string, n: number): string {
  return addMonths(`${month}-01`, n).slice(0, 7);
}

/** Primeiro e último dia do mês 'YYYY-MM'. */
export function monthRange(month: string): { from: string; to: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}` };
}

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTH_NAMES_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** '2026-03' → 'mar/26'. */
export function shortMonthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`;
}

/** '2026-03' → 'março de 2026'. */
export function longMonthLabel(month: string): string {
  return `${MONTH_NAMES_LONG[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
}

/** '2026-03-10' → '10/03/2026'. */
export function formatDateBr(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}
