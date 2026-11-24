import { NextResponse } from 'next/server';
import { financeDbContext, financeErrorResponse } from '@/lib/finance/context';
import { isMonthKey, monthOf, monthRange, shiftMonth, todayInBrazil } from '@/lib/finance/dates';
import { estimatedTaxCents, fatorR, mrrCents, payroll12Cents, rbt12Cents } from '@/lib/finance/simples';
import { effectiveBrlCents } from '@/lib/finance/types';

/** GET /api/financeiro/simples?month=YYYY-MM — RBT12, folha, Fator R, imposto estimado e MRR. */
export async function GET(request: Request) {
  try {
    const { repo, store } = await financeDbContext();
    const month = new URL(request.url).searchParams.get('month') ?? monthOf(todayInBrazil());
    if (!isMonthKey(month)) return NextResponse.json({ error: 'Mês inválido' }, { status: 400 });
    const [entries, settings, contracts] = await Promise.all([
      repo.listEntries({ from: monthRange(shiftMonth(month, -12)).from, to: monthRange(month).to }),
      store.settings(),
      store.contracts(),
    ]);
    const rbt12 = rbt12Cents(entries, month);
    const payroll = payroll12Cents(entries, month, settings.payroll_category_id);
    const monthIncome = entries
      .filter((e) => e.kind === 'income' && monthOf(e.date) === month)
      .reduce((s, e) => s + effectiveBrlCents(e), 0);
    return NextResponse.json({
      simples: {
        month,
        rbt12_cents: rbt12,
        payroll12_cents: payroll,
        fator_r: fatorR(payroll, rbt12),
        month_income_cents: monthIncome,
        estimated_tax_cents: estimatedTaxCents(monthIncome, settings.simples_aliquota_percent),
        mrr_cents: mrrCents(contracts),
        settings,
      },
    });
  } catch (err) {
    return financeErrorResponse(err);
  }
}

/** PUT /api/financeiro/simples — { aliquota: "6,5" | null, payroll_category_id: uuid | null } */
export async function PUT(request: Request) {
  try {
    const { repo, store } = await financeDbContext();
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    let aliquota: number | null = null;
    if (body.aliquota !== null && body.aliquota !== undefined && String(body.aliquota).trim() !== '') {
      aliquota = Number(String(body.aliquota).replace(',', '.'));
      if (!Number.isFinite(aliquota) || aliquota < 0 || aliquota > 100) {
        return NextResponse.json({ error: 'Alíquota deve ficar entre 0 e 100' }, { status: 400 });
      }
      aliquota = Math.round(aliquota * 100) / 100;
    }
    let payroll: string | null = null;
    if (typeof body.payroll_category_id === 'string' && body.payroll_category_id) {
      const cat = (await repo.listCategories()).find((c) => c.id === body.payroll_category_id);
      if (!cat || cat.kind !== 'expense') return NextResponse.json({ error: 'Categoria de folha inválida' }, { status: 400 });
      payroll = cat.id;
    }
    await store.saveSettings({ simples_aliquota_percent: aliquota, payroll_category_id: payroll });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
