import type { CartLine, PricedItem, StoreProduct } from './types'

export const MAX_LINES = 20
export const MAX_QTY_PER_LINE = 50

export type PriceCartResult =
  | { ok: true; items: PricedItem[]; subtotal_cents: number; weight_oz: number }
  | { ok: false; error: string }

/**
 * Monta o carrinho a partir do catálogo do banco. O preço do navegador nunca
 * é usado: só slug, cor, tamanho e quantidade vêm de fora.
 */
export function priceCart(lines: CartLine[], products: StoreProduct[]): PriceCartResult {
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: 'Cart is empty' }
  if (lines.length > MAX_LINES) return { ok: false, error: 'Too many items in cart' }

  const bySlug = new Map(products.map((p) => [p.slug, p]))
  const items: PricedItem[] = []
  let subtotal = 0
  let weight = 0

  for (const line of lines) {
    const product = bySlug.get(line?.slug)
    if (!product || !product.active) return { ok: false, error: 'Product unavailable' }
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY_PER_LINE) {
      return { ok: false, error: 'Invalid quantity' }
    }
    if (!product.colors.includes(line.color)) return { ok: false, error: 'Invalid color' }
    if (!product.sizes.includes(line.size)) return { ok: false, error: 'Invalid size' }

    items.push({ product, color: line.color, size: line.size, qty: line.qty, unit_cents: product.price_cents })
    subtotal += product.price_cents * line.qty
    weight += Number(product.weight_oz) * line.qty
  }

  return { ok: true, items, subtotal_cents: subtotal, weight_oz: weight }
}

export function formatOrderNumber(prefix: string, n: number): string {
  return `#${prefix}-${n}`
}
