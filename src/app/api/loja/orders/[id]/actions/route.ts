import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { sendOrderEmail, type OrderEmailKind } from '@/lib/store/emails'
import { addOrderEvent } from '@/lib/store/events'
import { loadOrder, setOrderStatus } from '@/lib/store/order-query'
import { nextStatus } from '@/lib/store/order-status'
import { loadStoreSettings } from '@/lib/store/settings'
import { refundLabel } from '@/lib/store/shippo'
import { getStripe } from '@/lib/store/stripe'

type Params = { params: Promise<{ id: string }> }

const ACTIONS = ['start_preparing', 'mark_shipped', 'refund', 'resend_email'] as const
type Action = (typeof ACTIONS)[number]
const EMAIL_KINDS: OrderEmailKind[] = ['confirmed', 'shipped', 'delivered', 'refunded']

/**
 * POST /api/loja/orders/[id]/actions  { action, kind? }
 * Botões da tela Pedidos. Transição inválida → 409 (a UI recarrega).
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { accountId } = await storeAccount('agent')
    const { id } = await params
    const body = await request.json().catch(() => null)
    const action = body?.action as Action
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'invalid_action' }, { status: 400 })

    const db = supabaseAdmin()
    const order = await loadOrder(db, accountId, id)
    if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const conflict = () => NextResponse.json({ error: 'invalid_status', status: order.status }, { status: 409 })

    if (action === 'resend_email') {
      const kind = body?.kind as OrderEmailKind
      if (!EMAIL_KINDS.includes(kind)) return NextResponse.json({ error: 'invalid_kind' }, { status: 400 })
      return NextResponse.json({ result: await sendOrderEmail(db, accountId, id, kind) })
    }

    if (action === 'start_preparing') {
      const next = nextStatus(order.status, 'start_preparing')
      if (!next) return conflict()
      await setOrderStatus(db, id, next)
      await addOrderEvent(db, accountId, id, 'preparing')
      return NextResponse.json({ status: next })
    }

    if (action === 'mark_shipped') {
      const next = nextStatus(order.status, 'mark_shipped')
      if (!next) return conflict()
      await setOrderStatus(db, id, next, { shipped_at: new Date().toISOString() })
      await addOrderEvent(db, accountId, id, 'shipped')
      const email = await sendOrderEmail(db, accountId, id, 'shipped')
      return NextResponse.json({ status: next, email })
    }

    // refund
    const next = nextStatus(order.status, 'refund')
    if (!next) return conflict()
    const loaded = await loadStoreSettings(db, accountId)
    const stripeKey = loaded?.secrets.stripeSecretKey
    if (!stripeKey || !order.payment_intent) {
      return NextResponse.json({ error: 'Stripe não configurado ou pedido sem pagamento' }, { status: 412 })
    }
    try {
      await getStripe(stripeKey).refunds.create({ payment_intent: order.payment_intent })
    } catch (err) {
      await addOrderEvent(db, accountId, id, 'refund_failed', { message: String(err) })
      return NextResponse.json({ error: 'refund_failed' }, { status: 502 })
    }

    const { data: shipment } = await db.from('shipments').select('shippo_transaction_id').eq('order_id', id).maybeSingle()
    if (shipment?.shippo_transaction_id && loaded?.secrets.shippoApiKey) {
      try {
        await refundLabel(loaded.secrets.shippoApiKey, shipment.shippo_transaction_id)
        await addOrderEvent(db, accountId, id, 'label_refunded')
      } catch (err) {
        await addOrderEvent(db, accountId, id, 'label_refund_failed', { message: String(err) })
      }
    }

    // O webhook charge.refunded vai chegar depois e não fará nada (já refunded).
    await setOrderStatus(db, id, next)
    await addOrderEvent(db, accountId, id, 'refunded')
    const email = await sendOrderEmail(db, accountId, id, 'refunded')
    return NextResponse.json({ status: next, email })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}
