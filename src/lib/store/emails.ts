import type { SupabaseClient } from '@supabase/supabase-js'
import { renderOrderEmail, type OrderEmailKind } from './email-templates'
import { addOrderEvent } from './events'
import { formatOrderNumber } from './pricing'
import { loadStoreSettings } from './settings'

export { renderOrderEmail, type OrderEmailKind } from './email-templates'

/**
 * Envia o e-mail do pedido pelo Resend. Sem e-mail remetente (loja sem
 * domínio) ou sem chave, não envia e registra `email_skipped`.
 */
export async function sendOrderEmail(
  db: SupabaseClient,
  accountId: string,
  orderId: string,
  kind: OrderEmailKind,
): Promise<'sent' | 'skipped' | 'failed'> {
  const loaded = await loadStoreSettings(db, accountId)
  const { data: order } = await db
    .from('orders')
    .select('id, number, email, customer_name, total_cents')
    .eq('account_id', accountId)
    .eq('id', orderId)
    .maybeSingle()

  if (!loaded || !order) return 'failed'
  const { settings, secrets } = loaded
  if (!settings.emailFrom || !secrets.resendApiKey || !order.email) {
    const reason = !settings.emailFrom ? 'no_sender' : !secrets.resendApiKey ? 'no_key' : 'no_recipient'
    await addOrderEvent(db, accountId, orderId, 'email_skipped', { kind, reason })
    return 'skipped'
  }

  const [{ data: items }, { data: shipment }] = await Promise.all([
    db.from('order_items').select('product_name, color, size, quantity, unit_cents').eq('order_id', orderId),
    db.from('shipments').select('tracking_number, tracking_url, eta').eq('order_id', orderId).maybeSingle(),
  ])

  const email = renderOrderEmail(kind, {
    storeName: settings.storeName,
    orderNumber: formatOrderNumber(settings.orderPrefix, order.number),
    customerName: order.customer_name ?? '',
    items: (items ?? []).map((i) => ({
      name: i.product_name, color: i.color, size: i.size, qty: i.quantity, unitCents: i.unit_cents,
    })),
    totalCents: order.total_cents,
    trackingNumber: shipment?.tracking_number,
    trackingUrl: shipment?.tracking_url,
    eta: shipment?.eta,
    reviewUrl: settings.reviewUrl,
  })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secrets.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${settings.storeName} <${settings.emailFrom}>`,
        to: [order.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    })
    if (!res.ok) {
      await addOrderEvent(db, accountId, orderId, 'email_failed', { kind, status: res.status })
      return 'failed'
    }
    const { id } = await res.json().catch(() => ({ id: null }))
    await addOrderEvent(db, accountId, orderId, 'email_sent', { kind, id })
    return 'sent'
  } catch (err) {
    await addOrderEvent(db, accountId, orderId, 'email_failed', { kind, status: 0, message: String(err) })
    return 'failed'
  }
}
