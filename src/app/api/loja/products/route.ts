import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { PRODUCT_COLUMNS } from '@/lib/store/catalog'
import { parseProductInput } from '@/lib/store/product-input'

/** GET /api/loja/products — todos os produtos da loja (membros). */
export async function GET() {
  try {
    const { accountId } = await storeAccount()
    const { data, error } = await supabaseAdmin()
      .from('store_products')
      .select(PRODUCT_COLUMNS)
      .eq('account_id', accountId)
      .order('name')
    if (error) return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
    return NextResponse.json({
      products: (data ?? []).map((p) => ({ ...p, weight_oz: Number(p.weight_oz) })),
    })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}

/** POST /api/loja/products — admin. */
export async function POST(request: Request) {
  try {
    const { accountId } = await storeAccount('admin')
    const parsed = parseProductInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { data, error } = await supabaseAdmin()
      .from('store_products')
      .insert({ ...parsed.row, account_id: accountId })
      .select(PRODUCT_COLUMNS)
      .single()
    if (error) {
      const msg = error.code === '23505' ? 'Já existe um produto com esse slug' : 'Failed to create product'
      return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
    }
    return NextResponse.json({ product: data }, { status: 201 })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}
