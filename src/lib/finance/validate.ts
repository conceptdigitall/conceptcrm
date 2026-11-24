// Validação do que chega nas rotas de API. Nada vindo do navegador é gravado
// sem passar por aqui; a conversão para real é feita depois, no servidor.

import { isIsoDate } from './dates';
import { isFinanceCurrency, parseMoneyInput } from './money';
import type { FinanceKind, RecurringCycle } from './types';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Body = Record<string, unknown>;

const HEX = /^#[0-9a-f]{6}$/i;

const isKind = (v: unknown): v is FinanceKind =>
  v === 'expense' || v === 'income';
const isCycle = (v: unknown): v is RecurringCycle =>
  v === 'monthly' || v === 'yearly';
const has = (b: Body, k: string) => Object.prototype.hasOwnProperty.call(b, k);

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
}

function optionalText(v: unknown, max: number): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || v.length > max) return undefined;
  return v.trim() || null;
}

function categoryRef(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'string' && v.length <= 64 ? v : undefined;
}

function asBody(raw: unknown): Body | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Body)
    : null;
}

// ---------- Categorias ----------

export interface CategoryInput {
  name?: string;
  kind?: FinanceKind;
  color?: string;
  archived?: boolean;
}

export function parseCategoryInput(
  raw: unknown,
  partial = false
): Result<CategoryInput> {
  const b = asBody(raw);
  if (!b) return { ok: false, error: 'Corpo inválido' };
  const out: CategoryInput = {};
  if (!partial || has(b, 'name')) {
    const name = text(b.name, 60);
    if (!name)
      return {
        ok: false,
        error: 'Nome da categoria é obrigatório (até 60 caracteres)',
      };
    out.name = name;
  }
  if (!partial || has(b, 'kind')) {
    if (!isKind(b.kind))
      return { ok: false, error: 'Tipo deve ser gasto ou entrada' };
    out.kind = b.kind;
  }
  if (!partial || has(b, 'color')) {
    if (typeof b.color !== 'string' || !HEX.test(b.color))
      return { ok: false, error: 'Cor inválida' };
    out.color = b.color.toLowerCase();
  }
  if (has(b, 'archived')) {
    if (typeof b.archived !== 'boolean')
      return { ok: false, error: 'Campo arquivada inválido' };
    out.archived = b.archived;
  }
  return { ok: true, value: out };
}

// ---------- Lançamentos ----------

export interface EntryInput {
  kind?: FinanceKind;
  description?: string;
  category_id?: string | null;
  amount_cents?: number;
  currency?: string;
  date?: string;
  /** Cotação digitada à mão; null = buscar automaticamente. */
  manual_rate?: number | null;
  actual_brl_cents?: number | null;
  notes?: string | null;
}

function positiveRate(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 100000
    ? n
    : undefined;
}

export function parseEntryInput(
  raw: unknown,
  partial = false
): Result<EntryInput> {
  const b = asBody(raw);
  if (!b) return { ok: false, error: 'Corpo inválido' };
  const out: EntryInput = {};
  const need = (k: string) => !partial || has(b, k);

  if (need('kind')) {
    if (!isKind(b.kind))
      return { ok: false, error: 'Tipo deve ser gasto ou entrada' };
    out.kind = b.kind;
  }
  if (need('description')) {
    const d = text(b.description, 120);
    if (!d)
      return {
        ok: false,
        error: 'Descrição é obrigatória (até 120 caracteres)',
      };
    out.description = d;
  }
  if (need('category_id')) {
    const c = categoryRef(b.category_id);
    if (c === undefined) return { ok: false, error: 'Categoria inválida' };
    out.category_id = c;
  }
  if (need('amount')) {
    const cents = parseMoneyInput(b.amount);
    if (cents === null || cents <= 0)
      return { ok: false, error: 'Valor deve ser maior que zero' };
    out.amount_cents = cents;
  }
  if (need('currency')) {
    if (!isFinanceCurrency(b.currency))
      return { ok: false, error: 'Moeda não suportada' };
    out.currency = b.currency;
  }
  if (need('date')) {
    if (!isIsoDate(b.date)) return { ok: false, error: 'Data inválida' };
    out.date = b.date;
  }
  if (has(b, 'manual_rate')) {
    const r = positiveRate(b.manual_rate);
    if (r === undefined) return { ok: false, error: 'Cotação manual inválida' };
    out.manual_rate = r;
  }
  if (has(b, 'actual_brl')) {
    if (b.actual_brl === null || b.actual_brl === '')
      out.actual_brl_cents = null;
    else {
      const cents = parseMoneyInput(b.actual_brl);
      if (cents === null || cents <= 0)
        return { ok: false, error: 'Valor real em reais inválido' };
      out.actual_brl_cents = cents;
    }
  }
  if (has(b, 'notes')) {
    const n = optionalText(b.notes, 500);
    if (n === undefined)
      return {
        ok: false,
        error: 'Observação muito longa (até 500 caracteres)',
      };
    out.notes = n;
  }
  return { ok: true, value: out };
}

// ---------- Assinaturas e fixos ----------

export interface RecurringInput {
  kind?: FinanceKind;
  description?: string;
  category_id?: string | null;
  amount_cents?: number;
  currency?: string;
  cycle?: RecurringCycle;
  next_date?: string;
  active?: boolean;
  notes?: string | null;
}

export function parseRecurringInput(
  raw: unknown,
  partial = false
): Result<RecurringInput> {
  const base = parseEntryInput(
    partial ? raw : { ...(asBody(raw) ?? {}), date: asBody(raw)?.next_date },
    partial
  );
  if (!base.ok) return base;
  const b = asBody(raw)!;
  const v = base.value;
  const out: RecurringInput = {};
  if (v.kind !== undefined) out.kind = v.kind;
  if (v.description !== undefined) out.description = v.description;
  if (v.category_id !== undefined) out.category_id = v.category_id;
  if (v.amount_cents !== undefined) out.amount_cents = v.amount_cents;
  if (v.currency !== undefined) out.currency = v.currency;
  if (v.notes !== undefined) out.notes = v.notes;
  if (!partial || has(b, 'next_date')) {
    if (!isIsoDate(b.next_date))
      return { ok: false, error: 'Data da próxima cobrança inválida' };
    out.next_date = b.next_date;
  }
  if (!partial || has(b, 'cycle')) {
    if (!isCycle(b.cycle))
      return { ok: false, error: 'Ciclo deve ser mensal ou anual' };
    out.cycle = b.cycle;
  }
  if (has(b, 'active')) {
    if (typeof b.active !== 'boolean')
      return { ok: false, error: 'Campo ativa inválido' };
    out.active = b.active;
  }
  return { ok: true, value: out };
}

// ---------- Entrada de pagamento único (com cobrança mensal opcional) ----------

export interface OneTimeIncomeInput {
  description: string;
  category_id: string | null;
  amount_cents: number;
  currency: string;
  /** Data do pagamento único. */
  date: string;
  notes: string | null;
  /** Cobrança mensal que começa depois do pagamento único, se houver. */
  monthly: { amount_cents: number; start_date: string } | null;
}

/**
 * Corpo de POST /api/financeiro/recurring com cycle 'once':
 * { kind: 'income', description, category_id?, amount, currency, next_date, notes?,
 *   has_monthly?, monthly_amount?, monthly_start? }
 * O pagamento único vira um lançamento; a mensal (se marcada) vira um fixo.
 */
export function parseOneTimeIncomeInput(
  raw: unknown
): Result<OneTimeIncomeInput> {
  const b = asBody(raw);
  if (!b) return { ok: false, error: 'Corpo inválido' };
  if (b.kind !== 'income')
    return { ok: false, error: 'Pagamento único só existe para entradas' };
  // Só os campos de lançamento; cotação manual e valor de fatura não se aplicam aqui.
  const entryBody: Body = {};
  for (const k of [
    'kind',
    'description',
    'category_id',
    'amount',
    'currency',
    'notes',
  ])
    if (has(b, k)) entryBody[k] = b[k];
  entryBody.date = b.next_date;
  const base = parseEntryInput(entryBody);
  if (!base.ok) return base;
  const v = base.value;

  let monthly: OneTimeIncomeInput['monthly'] = null;
  if (b.has_monthly === true) {
    const cents = parseMoneyInput(b.monthly_amount);
    if (cents === null || cents <= 0)
      return {
        ok: false,
        error: 'Valor da cobrança mensal deve ser maior que zero',
      };
    if (!isIsoDate(b.monthly_start))
      return { ok: false, error: 'Data de início da cobrança mensal inválida' };
    monthly = { amount_cents: cents, start_date: b.monthly_start };
  } else if (b.has_monthly !== undefined && b.has_monthly !== false) {
    return { ok: false, error: 'Campo de cobrança mensal inválido' };
  }

  return {
    ok: true,
    value: {
      description: v.description!,
      category_id: v.category_id ?? null,
      amount_cents: v.amount_cents!,
      currency: v.currency!,
      date: v.date!,
      notes: v.notes ?? null,
      monthly,
    },
  };
}
