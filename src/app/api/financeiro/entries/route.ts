import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { isIsoDate, isMonthKey, monthRange } from '@/lib/finance/dates';
import { createEntry } from '@/lib/finance/service';
import { parseEntryInput } from '@/lib/finance/validate';

/** GET /api/financeiro/entries?month=YYYY-MM  (ou ?from=&to=, ou nada = todos). */
export async function GET(request: Request) {
  try {
    const repo = await financeRepository();
    const sp = new URL(request.url).searchParams;
    const month = sp.get('month');
    const from = sp.get('from');
    const to = sp.get('to');
    if (month && !isMonthKey(month)) return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    const filter = month ? monthRange(month) : { from: from ?? undefined, to: to ?? undefined };
    return NextResponse.json({ entries: await repo.listEntries(filter) });
  } catch (err) {
    return financeErrorResponse(err);
  }
}

/**
 * POST /api/financeiro/entries
 * { kind, description, category_id?, amount, currency, date, manual_rate?, actual_brl?, notes? }
 * A cotação e o valor em reais são calculados aqui, no servidor.
 */
export async function POST(request: Request) {
  try {
    const repo = await financeRepository();
    const parsed = parseEntryInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const v = parsed.value;
    const entry = await createEntry(repo, {
      ...v,
      kind: v.kind!,
      description: v.description!,
      amount_cents: v.amount_cents!,
      currency: v.currency!,
      date: v.date!,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
