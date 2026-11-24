// Operações de negócio usadas pelas rotas: buscam a cotação no servidor,
// convertem para real e gravam pelo repositório. Nenhum valor em reais vem
// do navegador, exceto o "valor real da fatura", que é dado digitado.

import { todayInBrazil } from './dates';
import { BASE_CURRENCY, toBrlCents } from './money';
import { getRateToBrl } from './rates';
import { advanceDate } from './recurring';
import type { FinanceRepository, NewEntry } from './repository';
import type { FinanceEntry, FinanceRecurring, RateSource } from './types';
import type { EntryInput, OneTimeIncomeInput } from './validate';

type Fetcher = Parameters<typeof getRateToBrl>[2];

export class FinanceInputError extends Error {
  readonly status = 400;
}

async function resolveRate(
  currency: string,
  date: string,
  manualRate: number | null | undefined,
  fetcher?: Fetcher
): Promise<{
  rate_to_brl: number;
  rate_source: RateSource;
  rate_date: string;
}> {
  if (currency === BASE_CURRENCY)
    return { rate_to_brl: 1, rate_source: 'fixed', rate_date: date };
  if (manualRate)
    return { rate_to_brl: manualRate, rate_source: 'manual', rate_date: date };
  const q = await getRateToBrl(currency, date, fetcher);
  return { rate_to_brl: q.rate, rate_source: q.source, rate_date: q.date };
}

async function checkCategory(
  repo: FinanceRepository,
  id: string | null | undefined,
  kind: string | undefined
): Promise<void> {
  if (!id) return;
  const cat = (await repo.listCategories()).find((c) => c.id === id);
  if (!cat) throw new FinanceInputError('Categoria não encontrada');
  if (kind && cat.kind !== kind)
    throw new FinanceInputError(
      'A categoria é de outro tipo (gasto x entrada)'
    );
}

export async function createEntry(
  repo: FinanceRepository,
  input: Required<
    Pick<
      EntryInput,
      'kind' | 'description' | 'amount_cents' | 'currency' | 'date'
    >
  > &
    EntryInput,
  extra: { recurring_id?: string | null } = {},
  fetcher?: Fetcher
): Promise<FinanceEntry> {
  await checkCategory(repo, input.category_id, input.kind);
  const rate = await resolveRate(
    input.currency,
    input.date,
    input.manual_rate,
    fetcher
  );
  const row: NewEntry = {
    kind: input.kind,
    description: input.description,
    category_id: input.category_id ?? null,
    amount_cents: input.amount_cents,
    currency: input.currency,
    date: input.date,
    ...rate,
    amount_brl_cents: toBrlCents(input.amount_cents, rate.rate_to_brl),
    // Em real não existe diferença de fatura.
    actual_brl_cents:
      input.currency === BASE_CURRENCY
        ? null
        : (input.actual_brl_cents ?? null),
    recurring_id: extra.recurring_id ?? null,
    notes: input.notes ?? null,
  };
  return repo.createEntry(row);
}

/** Edita; se valor, moeda, data ou cotação manual mudarem, recalcula a conversão. */
export async function updateEntry(
  repo: FinanceRepository,
  id: string,
  patch: EntryInput,
  fetcher?: Fetcher
): Promise<FinanceEntry | null> {
  const current = await repo.getEntry(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  if (patch.category_id !== undefined || patch.kind !== undefined)
    await checkCategory(repo, next.category_id, next.kind);

  const reconvert =
    patch.amount_cents !== undefined ||
    patch.currency !== undefined ||
    patch.date !== undefined ||
    patch.manual_rate !== undefined;
  const { manual_rate: manualRate, ...fields } = patch;
  let rate = {};
  if (reconvert) {
    // Sem cotação manual nova: mantém a manual antiga só se moeda e data não mudaram.
    const keepManual =
      manualRate === undefined &&
      current.rate_source === 'manual' &&
      next.currency === current.currency &&
      next.date === current.date;
    const r = await resolveRate(
      next.currency,
      next.date,
      keepManual ? current.rate_to_brl : manualRate,
      fetcher
    );
    rate = {
      ...r,
      amount_brl_cents: toBrlCents(next.amount_cents, r.rate_to_brl),
    };
  }
  const actual =
    next.currency === BASE_CURRENCY ? { actual_brl_cents: null } : {};
  return repo.updateEntry(id, { ...fields, ...rate, ...actual });
}

/**
 * Registra a cobrança de um fixo na data prevista (ou em `date`) e avança a
 * próxima cobrança um ciclo. Devolve o lançamento criado e o fixo atualizado.
 */
export async function chargeRecurring(
  repo: FinanceRepository,
  rec: FinanceRecurring,
  opts: {
    date?: string;
    actual_brl_cents?: number | null;
    manual_rate?: number | null;
  } = {},
  fetcher?: Fetcher
): Promise<{ entry: FinanceEntry; recurring: FinanceRecurring | null }> {
  if (!rec.active) throw new FinanceInputError('Este fixo está pausado');
  const date =
    opts.date ??
    (rec.next_date <= todayInBrazil() ? rec.next_date : todayInBrazil());
  const entry = await createEntry(
    repo,
    {
      kind: rec.kind,
      description: rec.description,
      category_id: rec.category_id,
      amount_cents: rec.amount_cents,
      currency: rec.currency,
      date,
      manual_rate: opts.manual_rate ?? null,
      actual_brl_cents: opts.actual_brl_cents ?? null,
      notes: null,
    },
    { recurring_id: rec.id },
    fetcher
  );
  const recurring = await repo.updateRecurring(rec.id, {
    next_date: advanceDate(rec.next_date, rec.cycle),
  });
  return { entry, recurring };
}

/**
 * Entrada de pagamento único: vira um lançamento na data do pagamento e, se
 * houver cobrança mensal, também um fixo mensal de entrada começando em
 * `monthly.start_date`. Se o fixo falhar, o lançamento é desfeito.
 */
export async function createOneTimeIncome(
  repo: FinanceRepository,
  input: OneTimeIncomeInput,
  fetcher?: Fetcher
): Promise<{ entry: FinanceEntry; recurring: FinanceRecurring | null }> {
  const entry = await createEntry(
    repo,
    {
      kind: 'income',
      description: input.description,
      category_id: input.category_id,
      amount_cents: input.amount_cents,
      currency: input.currency,
      date: input.date,
      notes: input.notes,
    },
    {},
    fetcher
  );
  if (!input.monthly) return { entry, recurring: null };
  try {
    const recurring = await repo.createRecurring({
      kind: 'income',
      description: `${input.description} (mensal)`.slice(0, 120),
      category_id: input.category_id,
      amount_cents: input.monthly.amount_cents,
      currency: input.currency,
      cycle: 'monthly',
      next_date: input.monthly.start_date,
      active: true,
      notes: input.notes,
    });
    return { entry, recurring };
  } catch (err) {
    await repo.deleteEntry(entry.id).catch(() => undefined);
    throw err;
  }
}
