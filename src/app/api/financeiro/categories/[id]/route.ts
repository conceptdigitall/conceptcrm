import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { parseCategoryInput } from '@/lib/finance/validate';

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/financeiro/categories/[id] — renomear, mudar cor/tipo ou arquivar. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const repo = await financeRepository();
    const { id } = await params;
    const parsed = parseCategoryInput(await request.json().catch(() => null), true);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const category = await repo.updateCategory(id, parsed.value);
    if (!category) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ category });
  } catch (err) {
    return financeErrorResponse(err);
  }
}

/** DELETE /api/financeiro/categories/[id] — lançamentos dela ficam "sem categoria". */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const repo = await financeRepository();
    const { id } = await params;
    if (!(await repo.deleteCategory(id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
