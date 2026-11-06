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
import { setOrderStatus } from '@/lib/store/order-query'
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

  const HANDLED = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'charge.refunded']
  if (!HANDLED.includes(event.type)) {
    return NextResponse.json({ received: true })
  }
  if (!(await claimWebhook(db, 'stripe', event.id, accountId))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status === 'paid' && session.metadata?.account_id === accountId) {
        const items = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ['data.price.product'],
        })
        const { orderId, needsConfirmation } = await createPaidOrder(
          db, accountId, session as unknown as PaidSession, items.data as unknown as PaidLineItem[],
        )
        if (needsConfirmation) await sendOrderEmail(db, accountId, orderId, 'confirmed')
      }
    } else {
      const charge = event.data.object as Stripe.Charge
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      if (pi) await markRefunded(db, accountId, pi, charge.refunded === true, charge.amount_refunded ?? 0)
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[loja/webhooks/stripe] failed:', err)
    await releaseWebhook(db, 'stripe', event.id)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}

async function markRefunded(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  paymentIntent: string,
  fullyRefunded: boolean,
  amountRefunded: number,
) {
  const { data: order } = await db
    .from('orders')
    .select('id, status')
    .eq('account_id', accountId)
    .eq('payment_intent', paymentIntent)
    .maybeSingle()
  if (!order) return
  if (order.status === 'refunded') return
  if (!fullyRefunded) {
    // Reembolso parcial (ex.: desconto de boa vontade): o pedido segue o fluxo.
    await addOrderEvent(db, accountId, order.id, 'partial_refund', { amount_refunded_cents: amountRefunded })
    return
  }

  if (!nextStatus(order.status as OrderStatus, 'refund')) {
    await addOrderEvent(db, accountId, order.id, 'refund_after_ship', { status: order.status })
    return
  }
  // Se o botão do CRM reembolsou ao mesmo tempo, só um dos dois faz a transição e manda o e-mail.
  if (!(await setOrderStatus(db, order.id, 'refunded', order.status as OrderStatus))) return
  await addOrderEvent(db, accountId, order.id, 'refunded', {})
  await sendOrderEmail(db, accountId, order.id, 'refunded')
}
