import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { createOneTimeIncome } from '@/lib/finance/service';
import {
  parseOneTimeIncomeInput,
  parseRecurringInput,
} from '@/lib/finance/validate';

/** GET /api/financeiro/recurring — assinaturas e custos/receitas fixos. */
export async function GET() {
  try {
    const repo = await financeRepository();
    return NextResponse.json({ recurring: await repo.listRecurring() });
  } catch (err) {
    return financeErrorResponse(err);
  }
}

/**
 * POST /api/financeiro/recurring — { kind, description, category_id?, amount, currency, cycle, next_date, notes? }
 * cycle 'once' (só entradas): registra o pagamento único como lançamento e, com
 * has_monthly + monthly_amount + monthly_start, cadastra também o fixo mensal.
 */
export async function POST(request: Request) {
  try {
    const repo = await financeRepository();
    const body = await request.json().catch(() => null);
    if (
      body &&
      typeof body === 'object' &&
      (body as Record<string, unknown>).cycle === 'once'
    ) {
      const once = parseOneTimeIncomeInput(body);
      if (!once.ok)
        return NextResponse.json({ error: once.error }, { status: 400 });
      return NextResponse.json(await createOneTimeIncome(repo, once.value), {
        status: 201,
      });
    }
    const parsed = parseRecurringInput(body);
    if (!parsed.ok)
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    const v = parsed.value;
    if (v.category_id) {
      const cat = (await repo.listCategories()).find(
        (c) => c.id === v.category_id
      );
      if (!cat || cat.kind !== v.kind)
        return NextResponse.json(
          { error: 'Categoria inválida para este tipo' },
          { status: 400 }
        );
    }
    const recurring = await repo.createRecurring({
      kind: v.kind!,
      description: v.description!,
      category_id: v.category_id ?? null,
      amount_cents: v.amount_cents!,
      currency: v.currency!,
      cycle: v.cycle!,
      next_date: v.next_date!,
      active: v.active ?? true,
      notes: v.notes ?? null,
    });
    return NextResponse.json({ recurring }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
