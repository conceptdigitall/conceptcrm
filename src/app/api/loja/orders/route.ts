import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { formatOrderNumber } from '@/lib/store/pricing'
import { loadStoreSettings } from '@/lib/store/settings'

/**
 * GET /api/loja/orders — pedidos da loja (mais novos primeiro), com itens.
 * `?contact=<id>` filtra os pedidos de um cliente (ficha do contato).
 */
export async function GET(request: Request) {
  try {
    const { accountId } = await storeAccount()
    const db = supabaseAdmin()
    const contactId = new URL(request.url).searchParams.get('contact')

    let query = db
      .from('orders')
      .select('id, number, status, customer_name, email, total_cents, created_at, paid_at, status_changed_at, contact_id')
      .eq('account_id', accountId)
    if (contactId) query = query.eq('contact_id', contactId)
    const { data: orders, error } = await query.order('created_at', { ascending: false }).limit(500)
    if (error) return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })

    const ids = (orders ?? []).map((o) => o.id)
    const { data: items } = ids.length
      ? await db.from('order_items').select('order_id, product_name, color, size, quantity, unit_cents').in('order_id', ids)
      : { data: [] }

    const loaded = await loadStoreSettings(db, accountId)
    const prefix = loaded?.settings.orderPrefix ?? 'EW'
    const byOrder = new Map<string, unknown[]>()
    for (const i of items ?? []) byOrder.set(i.order_id, [...(byOrder.get(i.order_id) ?? []), i])

    return NextResponse.json({
      orders: (orders ?? []).map((o) => ({
        ...o,
        display_number: formatOrderNumber(prefix, o.number),
        items: byOrder.get(o.id) ?? [],
      })),
      config: {
        emailsEnabled: Boolean(loaded?.settings.emailFrom && loaded?.secrets.resendApiKey),
        hasShippo: Boolean(loaded?.secrets.shippoApiKey),
        hasStripe: Boolean(loaded?.secrets.stripeSecretKey),
      },
    })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}
