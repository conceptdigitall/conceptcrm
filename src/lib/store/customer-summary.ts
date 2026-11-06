import type { OrderStatus } from './types'

const NOT_COUNTED: OrderStatus[] = ['refunded', 'canceled']

/** Resumo de compras do cliente (ficha do contato). Ignora reembolsos. */
export function summarizeCustomer(
  orders: { total_cents: number; status: OrderStatus; paid_at: string | null }[],
): { count: number; totalCents: number; avgCents: number; lastPurchaseAt: string | null } {
  const valid = orders.filter((o) => !NOT_COUNTED.includes(o.status))
  const totalCents = valid.reduce((s, o) => s + o.total_cents, 0)
  const last = valid
    .map((o) => o.paid_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1) ?? null
  return {
    count: valid.length,
    totalCents,
    avgCents: valid.length ? Math.round(totalCents / valid.length) : 0,
    lastPurchaseAt: last,
  }
}
