import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { addOrderEvent } from '@/lib/store/events'
import { loadOrder, setOrderStatus } from '@/lib/store/order-query'
import { nextStatus } from '@/lib/store/order-status'
import { loadStoreSettings } from '@/lib/store/settings'
import { buyLabel, getRate, ShippoError } from '@/lib/store/shippo'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/loja/orders/[id]/label  { rateId }
 * Compra a etiqueta escolhida. Só em "Em produção" e só uma vez por pedido.
 */
export async function POST(request: Request, { params }: Params) {
  let accountId = ''
  let orderId = ''
  try {
    ;({ accountId } = await storeAccount('agent'))
    orderId = (await params).id
    const db = supabaseAdmin()
    const body = await request.json().catch(() => null)
    const rateId = typeof body?.rateId === 'string' ? body.rateId : ''
    if (!rateId) return NextResponse.json({ error: 'rateId required' }, { status: 400 })

    const order = await loadOrder(db, accountId, orderId)
    if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const next = nextStatus(order.status, 'label_bought')
    if (!next) return NextResponse.json({ error: 'invalid_status', status: order.status }, { status: 409 })

    const { data: existing } = await db.from('shipments').select('id').eq('order_id', orderId).maybeSingle()
    if (existing) return NextResponse.json({ error: 'label_already_bought' }, { status: 409 })

    const loaded = await loadStoreSettings(db, accountId)
    const apiKey = loaded?.secrets.shippoApiKey
    if (!apiKey) return NextResponse.json({ error: 'Configure o Shippo em Configurações → Loja' }, { status: 412 })

    let label: Awaited<ReturnType<typeof buyLabel>>
    let rate: Awaited<ReturnType<typeof getRate>> | null = null
    try {
      rate = await getRate(apiKey, rateId).catch(() => null)
      label = await buyLabel(apiKey, rateId)
    } catch (err) {
      const messages = err instanceof ShippoError ? err.messages : [String(err)]
      await addOrderEvent(db, accountId, orderId, 'label_failed', { messages })
      return NextResponse.json({ error: 'label_failed', messages }, { status: 502 })
    }

    const { error: shipErr } = await db.from('shipments').insert({
      account_id: accountId,
      order_id: orderId,
      carrier: rate?.carrier ?? null,
      service: rate?.service ?? null,
      cost_cents: rate?.amount_cents ?? null,
      tracking_number: label.trackingNumber,
      tracking_url: label.trackingUrl,
      label_url: label.labelUrl,
      eta: label.eta,
      shippo_transaction_id: label.transactionId,
    })
    if (shipErr) {
      // Etiqueta já paga no Shippo: registra para não perder o PDF.
      await addOrderEvent(db, accountId, orderId, 'label_save_failed', { ...label, error: shipErr.message })
      return NextResponse.json({ error: 'label_save_failed', labelUrl: label.labelUrl }, { status: 500 })
    }
    await setOrderStatus(db, orderId, next)
    await addOrderEvent(db, accountId, orderId, 'label_bought', {
      carrier: rate?.carrier, service: rate?.service, cost_cents: rate?.amount_cents, tracking_number: label.trackingNumber,
    })
    return NextResponse.json({ labelUrl: label.labelUrl, trackingNumber: label.trackingNumber })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}
