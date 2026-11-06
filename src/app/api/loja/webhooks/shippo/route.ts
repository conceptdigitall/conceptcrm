import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { sendOrderEmail } from '@/lib/store/emails'
import { addOrderEvent } from '@/lib/store/events'
import { setOrderStatus } from '@/lib/store/order-query'
import { nextStatus } from '@/lib/store/order-status'
import { claimWebhook, releaseWebhook } from '@/lib/store/orders'
import { publicStoreAccount } from '@/lib/store/public-route'
import { loadStoreSettings } from '@/lib/store/settings'
import type { OrderStatus } from '@/lib/store/types'

const sameToken = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * POST /api/loja/webhooks/shippo?token=<token>
 * Evento track_updated: atualiza o rastreio; DELIVERED → pedido entregue + e-mail.
 */
export async function POST(request: Request) {
  const store = publicStoreAccount()
  if (store instanceof NextResponse) return store
  const { accountId } = store

  const db = supabaseAdmin()
  const loaded = await loadStoreSettings(db, accountId)
  const expected = loaded?.secrets.shippoWebhookToken
  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!expected || !sameToken(token, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const data = body?.data
  const trackingNumber = typeof data?.tracking_number === 'string' ? data.tracking_number : ''
  const status = typeof data?.tracking_status?.status === 'string' ? data.tracking_status.status : ''
  if (body?.event !== 'track_updated' || !trackingNumber || !status) return NextResponse.json({ received: true })

  const { data: shipment } = await db
    .from('shipments')
    .select('id, order_id')
    .eq('account_id', accountId)
    .eq('tracking_number', trackingNumber)
    .maybeSingle()
  if (!shipment) return NextResponse.json({ received: true })

  const eventId = `${trackingNumber}:${status}:${data.tracking_status.status_date ?? ''}`
  if (!(await claimWebhook(db, 'shippo', eventId, accountId))) return NextResponse.json({ received: true, duplicate: true })

  try {
    await db
      .from('shipments')
      .update({ tracking_status: status, eta: data.eta ?? null, updated_at: new Date().toISOString() })
      .eq('id', shipment.id)

    if (status === 'DELIVERED') {
      const { data: order } = await db.from('orders').select('id, status').eq('id', shipment.order_id).maybeSingle()
      const next = order ? nextStatus(order.status as OrderStatus, 'mark_delivered') : null
      if (order && next) {
        const moved = await setOrderStatus(db, order.id, next, order.status as OrderStatus, {
          delivered_at: data.tracking_status.status_date ?? new Date().toISOString(),
        })
        if (moved) {
          await addOrderEvent(db, accountId, order.id, 'delivered', {})
          await sendOrderEmail(db, accountId, order.id, 'delivered')
        }
      }
    } else if (status === 'RETURNED' || status === 'FAILURE') {
      await addOrderEvent(db, accountId, shipment.order_id, 'tracking_problem', { status, details: data.tracking_status.status_details })
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[loja/webhooks/shippo] failed:', err)
    await releaseWebhook(db, 'shippo', eventId)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
