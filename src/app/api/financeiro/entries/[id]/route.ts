import { NextResponse } from 'next/server';
import { financeErrorResponse, financeRepository } from '@/lib/finance/context';
import { updateEntry } from '@/lib/finance/service';
import { parseEntryInput } from '@/lib/finance/validate';

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/financeiro/entries/[id] — campos parciais; reconverte se valor/moeda/data mudarem. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const repo = await financeRepository();
    const { id } = await params;
    const parsed = parseEntryInput(await request.json().catch(() => null), true);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const entry = await updateEntry(repo, id, parsed.value);
    if (!entry) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (err) {
    return financeErrorResponse(err);
  }
}

/** DELETE /api/financeiro/entries/[id] */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const repo = await financeRepository();
    const { id } = await params;
    if (!(await repo.deleteEntry(id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return financeErrorResponse(err);
  }
}
