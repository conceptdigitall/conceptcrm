import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { parseCategoryInput } from '@/lib/finance/validate';

/** GET /api/financeiro/categories — todas, inclusive arquivadas. */
export async function GET() {
  try {
    const repo = await financeRepository();
    return NextResponse.json({ categories: await repo.listCategories() });
  } catch (err) {
    return financeErrorResponse(err);
  }
}

/** POST /api/financeiro/categories — { name, kind, color }. */
export async function POST(request: Request) {
  try {
    const repo = await financeRepository();
    const parsed = parseCategoryInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { name, kind, color } = parsed.value as Required<typeof parsed.value>;
    const exists = (await repo.listCategories()).some(
      (c) => c.kind === kind && c.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'),
    );
    if (exists) return NextResponse.json({ error: 'Já existe uma categoria com esse nome' }, { status: 409 });
    return NextResponse.json({ category: await repo.createCategory({ name, kind, color }) }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
