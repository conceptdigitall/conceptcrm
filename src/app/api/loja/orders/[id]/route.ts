import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { loadOrder } from '@/lib/store/order-query'
import { formatOrderNumber } from '@/lib/store/pricing'
import { loadStoreSettings } from '@/lib/store/settings'

type Params = { params: Promise<{ id: string }> }

/** GET /api/loja/orders/[id] — pedido, itens, envio e linha do tempo. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { accountId } = await storeAccount()
    const { id } = await params
    const db = supabaseAdmin()
    const order = await loadOrder(db, accountId, id)
    if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const [{ data: items }, { data: shipment }, { data: events }, loaded] = await Promise.all([
      db.from('order_items').select('id, product_name, product_slug, color, size, quantity, unit_cents').eq('order_id', id),
      db.from('shipments').select('*').eq('order_id', id).maybeSingle(),
      db.from('order_events').select('id, type, detail, created_at').eq('order_id', id).order('created_at', { ascending: true }),
      loadStoreSettings(db, accountId),
    ])

    return NextResponse.json({
      order: { ...order, display_number: formatOrderNumber(loaded?.settings.orderPrefix ?? 'EW', order.number) },
      items: items ?? [],
      shipment: shipment ?? null,
      events: events ?? [],
    })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}
