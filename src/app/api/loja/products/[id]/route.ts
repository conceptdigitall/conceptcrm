import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { PRODUCT_COLUMNS } from '@/lib/store/catalog'
import { parseProductInput } from '@/lib/store/product-input'

type Params = { params: Promise<{ id: string }> }

/** PATCH /api/loja/products/[id] — admin. Desativar = { active: false }. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { accountId } = await storeAccount('admin')
    const { id } = await params
    const parsed = parseProductInput(await request.json().catch(() => null), true)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { data, error } = await supabaseAdmin()
      .from('store_products')
      .update({ ...parsed.row, updated_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('id', id)
      .select(PRODUCT_COLUMNS)
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ product: data })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}
