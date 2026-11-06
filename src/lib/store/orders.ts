import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { addOrderEvent } from './events'
import type { Address } from './types'

export { addOrderEvent } from './events'

/**
 * Reivindica um aviso de webhook. false = já processado antes.
 * Se o processamento falhar depois, chame releaseWebhook para o provedor
 * poder tentar de novo.
 */
export async function claimWebhook(
  db: SupabaseClient,
  provider: 'stripe' | 'shippo',
  eventId: string,
  accountId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('processed_webhooks')
    .upsert({ provider, event_id: eventId, account_id: accountId }, { onConflict: 'provider,event_id', ignoreDuplicates: true })
    .select('event_id')
  if (error) throw new Error(`processed_webhooks: ${error.message}`)
  return (data ?? []).length > 0
}

export async function releaseWebhook(db: SupabaseClient, provider: string, eventId: string): Promise<void> {
  await db.from('processed_webhooks').delete().eq('provider', provider).eq('event_id', eventId)
}

/** Casa por e-mail, depois telefone; senão cria (telefone vazio é aceito). */
export async function upsertCustomerContact(
  db: SupabaseClient,
  accountId: string,
  customer: { name: string | null; email: string | null; phone: string | null },
): Promise<string> {
  const email = customer.email?.trim() || null
  const phone = customer.phone?.trim() || ''

  if (email) {
    const { data } = await db
      .from('contacts').select('id').eq('account_id', accountId).ilike('email', email).limit(1)
    if (data?.[0]) return data[0].id as string
  }
  const normalized = phone ? normalizePhone(phone) : ''
  if (normalized) {
    const { data } = await db
      .from('contacts').select('id, email').eq('account_id', accountId).eq('phone_normalized', normalized).limit(1)
    if (data?.[0]) {
      if (email && !data[0].email) await db.from('contacts').update({ email }).eq('id', data[0].id)
      return data[0].id as string
    }
  }

  const { data: account } = await db.from('accounts').select('owner_user_id').eq('id', accountId).maybeSingle()
  if (!account?.owner_user_id) throw new Error('account owner not found')

  const { data: created, error } = await db
    .from('contacts')
    .insert({ account_id: accountId, user_id: account.owner_user_id, name: customer.name, email, phone })
    .select('id')
    .single()
  if (error || !created) throw new Error(`contacts insert: ${error?.message}`)
  return created.id as string
}

// ---------- Pedido pago a partir da sessão do Stripe ----------

type StripeAddress = {
  line1?: string | null; line2?: string | null; city?: string | null
  state?: string | null; postal_code?: string | null; country?: string | null
} | null | undefined

export type PaidSession = {
  id: string
  payment_intent?: string | { id: string } | null
  amount_subtotal?: number | null
  amount_total?: number | null
  total_details?: { amount_tax?: number | null; amount_shipping?: number | null } | null
  customer_details?: { name?: string | null; email?: string | null; phone?: string | null; address?: StripeAddress } | null
  collected_information?: { shipping_details?: { name?: string | null; address?: StripeAddress } | null } | null
  shipping_details?: { name?: string | null; address?: StripeAddress } | null
}

export type PaidLineItem = {
  quantity?: number | null
  amount_subtotal?: number | null
  price?: { unit_amount?: number | null; product?: unknown } | null
}

function toAddress(name: string | null | undefined, a: StripeAddress, phone?: string | null): Address | null {
  if (!a?.line1) return null
  return {
    name: name ?? '',
    street1: a.line1,
    street2: a.line2 ?? null,
    city: a.city ?? '',
    state: a.state ?? '',
    zip: a.postal_code ?? '',
    country: a.country ?? 'US',
    phone: phone ?? null,
  }
}

const lineMeta = (li: PaidLineItem) => {
  const product = li.price?.product as { metadata?: Record<string, string> } | undefined
  return product?.metadata ?? {}
}

export async function createPaidOrder(
  db: SupabaseClient,
  accountId: string,
  session: PaidSession,
  lineItems: PaidLineItem[],
): Promise<{ orderId: string; created: boolean }> {
  const { data: existing } = await db
    .from('orders').select('id').eq('payment_provider', 'stripe').eq('payment_ref', session.id).maybeSingle()
  if (existing) return { orderId: existing.id as string, created: false }

  const customer = session.customer_details ?? {}
  const shipping = session.collected_information?.shipping_details ?? session.shipping_details ?? null
  const contactId = await upsertCustomerContact(db, accountId, {
    name: customer.name ?? shipping?.name ?? null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
  })

  const { data: number, error: numErr } = await db.rpc('store_next_order_number', { p_account: accountId })
  if (numErr || typeof number !== 'number') throw new Error(`order number: ${numErr?.message ?? 'no store settings'}`)

  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  const now = new Date().toISOString()
  const { data: order, error } = await db
    .from('orders')
    .insert({
      account_id: accountId,
      number,
      status: 'paid',
      contact_id: contactId,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      customer_name: customer.name ?? shipping?.name ?? null,
      shipping_address: toAddress(shipping?.name ?? customer.name, shipping?.address ?? customer.address, customer.phone),
      subtotal_cents: session.amount_subtotal ?? 0,
      shipping_cents: session.total_details?.amount_shipping ?? 0,
      tax_cents: session.total_details?.amount_tax ?? 0,
      total_cents: session.amount_total ?? 0,
      payment_provider: 'stripe',
      payment_ref: session.id,
      payment_intent: paymentIntent,
      paid_at: now,
      status_changed_at: now,
    })
    .select('id')
    .single()
  if (error || !order) {
    // Corrida com outro aviso da mesma sessão: o outro já criou.
    if (error?.code === '23505') {
      const { data: again } = await db
        .from('orders').select('id').eq('payment_provider', 'stripe').eq('payment_ref', session.id).maybeSingle()
      if (again) return { orderId: again.id as string, created: false }
    }
    throw new Error(`orders insert: ${error?.message}`)
  }
  const orderId = order.id as string

  // Itens congelados: nome, cor, tamanho e preço do momento da compra.
  const slugs = lineItems.map((li) => lineMeta(li).slug).filter(Boolean)
  const { data: products } = await db
    .from('store_products').select('id, slug, name, price_cents').eq('account_id', accountId).in('slug', slugs)
  const bySlug = new Map((products ?? []).map((p) => [p.slug as string, p]))

  let expectedSubtotal = 0
  const rows = lineItems.map((li) => {
    const meta = lineMeta(li)
    const product = bySlug.get(meta.slug)
    const qty = li.quantity ?? 1
    const unit = li.price?.unit_amount ?? Math.round((li.amount_subtotal ?? 0) / qty)
    expectedSubtotal += (product ? Number(product.price_cents) : unit) * qty
    return {
      account_id: accountId,
      order_id: orderId,
      product_id: product?.id ?? null,
      product_slug: meta.slug ?? 'unknown',
      product_name: (product?.name as string) ?? 'Item',
      color: meta.color ?? null,
      size: meta.size ?? null,
      quantity: qty,
      unit_cents: unit,
    }
  })
  if (rows.length) {
    const { error: itemsErr } = await db.from('order_items').insert(rows)
    if (itemsErr) console.error('[loja] order_items insert failed:', itemsErr.message)
  }

  await addOrderEvent(db, accountId, orderId, 'paid', { total_cents: session.amount_total ?? 0 })
  if (expectedSubtotal !== (session.amount_subtotal ?? 0)) {
    await addOrderEvent(db, accountId, orderId, 'amount_mismatch', {
      expected_cents: expectedSubtotal,
      charged_cents: session.amount_subtotal ?? 0,
    })
  }
  return { orderId, created: true }
}
