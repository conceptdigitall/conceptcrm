import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { parseRecurringInput } from '@/lib/finance/validate';

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/financeiro/recurring/[id] — editar, pausar ({ active: false }) ou retomar. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const repo = await financeRepository();
    const { id } = await params;
    const parsed = parseRecurringInput(await request.json().catch(() => null), true);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const current = await repo.getRecurring(id);
    if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const kind = parsed.value.kind ?? current.kind;
    const categoryId = parsed.value.category_id !== undefined ? parsed.value.category_id : current.category_id;
    if (categoryId && (parsed.value.kind !== undefined || parsed.value.category_id !== undefined)) {
      const cat = (await repo.listCategories()).find((c) => c.id === categoryId);
      if (!cat || cat.kind !== kind) return NextResponse.json({ error: 'Categoria inválida para este tipo' }, { status: 400 });
    }
    const recurring = await repo.updateRecurring(id, parsed.value);
    if (!recurring) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ recurring });
  } catch (err) {
    return financeErrorResponse(err);
  }
}

/** DELETE /api/financeiro/recurring/[id] — os lançamentos já registrados continuam. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const repo = await financeRepository();
    const { id } = await params;
    if (!(await repo.deleteRecurring(id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
