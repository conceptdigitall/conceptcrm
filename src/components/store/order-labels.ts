import type { OrderStatus } from '@/lib/store/types'

// Rótulos em pt-BR do módulo Loja (ver ledger, Task 4).

export const STATUS_LABEL: Record<OrderStatus, string> = {
  paid: 'Pago',
  preparing: 'Em produção',
  label_ready: 'Etiqueta pronta',
  shipped: 'Enviado',
  delivered: 'Entregue',
  canceled: 'Cancelado',
  refunded: 'Reembolsado',
}

export const BOARD_COLUMNS: OrderStatus[] = ['paid', 'preparing', 'label_ready', 'shipped', 'delivered']
export const CLOSED_STATUSES: OrderStatus[] = ['canceled', 'refunded']

export const EVENT_LABEL: Record<string, string> = {
  paid: 'Pagamento confirmado',
  preparing: 'Em produção',
  label_bought: 'Etiqueta comprada',
  label_failed: 'Falha ao gerar etiqueta',
  label_save_failed: 'Etiqueta paga, mas não salva',
  shipped: 'Marcado como enviado',
  delivered: 'Entregue (rastreio)',
  refunded: 'Reembolsado',
  refund_failed: 'Reembolso recusado pelo Stripe',
  refund_after_ship: 'Reembolso feito no Stripe depois do envio',
  label_refunded: 'Etiqueta anulada no Shippo',
  label_refund_failed: 'Não foi possível anular a etiqueta',
  amount_mismatch: 'Valor cobrado diferente do catálogo',
  tracking_problem: 'Problema no rastreio',
  email_sent: 'E-mail enviado',
  email_skipped: 'E-mail não enviado (desligado)',
  email_failed: 'Falha ao enviar e-mail',
}

export const EMAIL_KIND_LABEL: Record<string, string> = {
  confirmed: 'confirmação',
  shipped: 'envio',
  delivered: 'entrega',
  refunded: 'reembolso',
}

export const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}
