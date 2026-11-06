import type { OrderAction, OrderStatus } from './types'

// Única fonte das transições válidas; usada pela API e pela UI.
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderAction, OrderStatus>>> = {
  paid: { start_preparing: 'preparing', refund: 'refunded' },
  preparing: { label_bought: 'label_ready', refund: 'refunded' },
  label_ready: { mark_shipped: 'shipped', refund: 'refunded' },
  shipped: { mark_delivered: 'delivered' },
  delivered: {},
  canceled: {},
  refunded: {},
}

/** Próximo status, ou null se a ação não vale no status atual. */
export function nextStatus(current: OrderStatus, action: OrderAction): OrderStatus | null {
  return TRANSITIONS[current]?.[action] ?? null
}
