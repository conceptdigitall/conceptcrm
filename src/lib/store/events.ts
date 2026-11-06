import type { SupabaseClient } from '@supabase/supabase-js'

/** Linha do tempo do pedido. Falha aqui nunca derruba o fluxo principal. */
export async function addOrderEvent(
  db: SupabaseClient,
  accountId: string,
  orderId: string,
  type: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from('order_events').insert({ account_id: accountId, order_id: orderId, type, detail })
  if (error) console.error('[loja] order_events insert failed:', type, error.message)
}
