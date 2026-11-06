import type { SupabaseClient } from '@supabase/supabase-js'
import type { Address, OrderStatus } from './types'

export type OrderRow = {
  id: string
  account_id: string
  number: number
  status: OrderStatus
  shipping_address: Address | null
  payment_intent: string | null
  [key: string]: unknown
}

/** Pedido desta conta, ou null (pedido de outra conta = não existe). */
export async function loadOrder(db: SupabaseClient, accountId: string, orderId: string): Promise<OrderRow | null> {
  const { data } = await db.from('orders').select('*').eq('account_id', accountId).eq('id', orderId).maybeSingle()
  return (data as OrderRow | null) ?? null
}

/** Muda o status gravando a hora da mudança (o kanban mostra "há N dias"). */
export async function setOrderStatus(
  db: SupabaseClient,
  orderId: string,
  status: OrderStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from('orders')
    .update({ status, status_changed_at: now, updated_at: now, ...extra })
    .eq('id', orderId)
  if (error) throw new Error(`orders update: ${error.message}`)
}

/** Peso total dos itens (oz), lido do catálogo atual. */
export async function itemsWeightOz(db: SupabaseClient, accountId: string, orderId: string): Promise<number> {
  const { data: items } = await db.from('order_items').select('product_id, quantity').eq('order_id', orderId)
  const ids = (items ?? []).map((i) => i.product_id).filter(Boolean)
  if (ids.length === 0) return 0
  const { data: products } = await db.from('store_products').select('id, weight_oz').eq('account_id', accountId).in('id', ids)
  const weight = new Map((products ?? []).map((p) => [p.id, Number(p.weight_oz)]))
  return (items ?? []).reduce((sum, i) => sum + (weight.get(i.product_id) ?? 0) * i.quantity, 0)
}
