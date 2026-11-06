import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { sendOrderEmail } from '@/lib/store/emails'
import { nextStatus } from '@/lib/store/order-status'
import {
  addOrderEvent,
  claimWebhook,
  createPaidOrder,
  releaseWebhook,
  type PaidLineItem,
  type PaidSession,
} from '@/lib/store/orders'
import { publicStoreAccount } from '@/lib/store/public-route'
import { loadStoreSettings } from '@/lib/store/settings'
import { getStripe } from '@/lib/store/stripe'
import type { OrderStatus } from '@/lib/store/types'

/**
 * POST /api/loja/webhooks/stripe
 * Eventos: checkout.session.completed (cria o pedido) e charge.refunded.
 * Cada evento é processado uma vez (processed_webhooks).
 */
export async function POST(request: Request) {
  const store = publicStoreAccount()
  if (store instanceof NextResponse) return store
  const { accountId } = store

  const db = supabaseAdmin()
  const loaded = await loadStoreSettings(db, accountId)
  const { stripeSecretKey, stripeWebhookSecret } = loaded?.secrets ?? {}
  if (!stripeSecretKey || !stripeWebhookSecret) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 })
  }

  const stripe = getStripe(stripeSecretKey)
  const body = await request.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, request.headers.get('stripe-signature') ?? '', stripeWebhookSecret)
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed' && event.type !== 'charge.refunded') {
    return NextResponse.json({ received: true })
  }
  if (!(await claimWebhook(db, 'stripe', event.id, accountId))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status === 'paid' && session.metadata?.account_id === accountId) {
        const items = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ['data.price.product'],
        })
        const { orderId, created } = await createPaidOrder(
          db, accountId, session as unknown as PaidSession, items.data as unknown as PaidLineItem[],
        )
        if (created) await sendOrderEmail(db, accountId, orderId, 'confirmed')
      }
    } else {
      const charge = event.data.object as Stripe.Charge
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      if (pi) await markRefunded(db, accountId, pi)
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[loja/webhooks/stripe] failed:', err)
    await releaseWebhook(db, 'stripe', event.id)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}

async function markRefunded(db: ReturnType<typeof supabaseAdmin>, accountId: string, paymentIntent: string) {
  const { data: order } = await db
    .from('orders')
    .select('id, status')
    .eq('account_id', accountId)
    .eq('payment_intent', paymentIntent)
    .maybeSingle()
  if (!order) return
  if (order.status === 'refunded') return

  if (!nextStatus(order.status as OrderStatus, 'refund')) {
    await addOrderEvent(db, accountId, order.id, 'refund_after_ship', { status: order.status })
    return
  }
  const now = new Date().toISOString()
  await db.from('orders').update({ status: 'refunded', status_changed_at: now, updated_at: now }).eq('id', order.id)
  await addOrderEvent(db, accountId, order.id, 'refunded', {})
  await sendOrderEmail(db, accountId, order.id, 'refunded')
}
