import { describe, expect, it } from 'vitest'
import { formatOrderNumber, priceCart } from './pricing'
import type { StoreProduct } from './types'

const tee = (over: Partial<StoreProduct> = {}): StoreProduct => ({
  id: 'p1', slug: 'yhwh', name: 'YHWH Tee', price_cents: 3200,
  colors: ['Black', 'Brown'], sizes: ['S', 'M', 'L'], weight_oz: 6,
  image_url: null, active: true, ...over,
})
const products = [tee(), tee({ id: 'p2', slug: 'child', name: 'Child of God', price_cents: 3000, weight_oz: 5.5 })]

describe('priceCart', () => {
  it('prices valid lines from the catalog', () => {
    const r = priceCart(
      [{ slug: 'yhwh', color: 'Black', size: 'M', qty: 2 }, { slug: 'child', color: 'Brown', size: 'S', qty: 1 }],
      products,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.subtotal_cents).toBe(2 * 3200 + 3000)
    expect(r.weight_oz).toBe(2 * 6 + 5.5)
    expect(r.items[0]).toMatchObject({ color: 'Black', size: 'M', qty: 2, unit_cents: 3200 })
  })
  it.each([
    ['qty 0', [{ slug: 'yhwh', color: 'Black', size: 'M', qty: 0 }]],
    ['qty negative', [{ slug: 'yhwh', color: 'Black', size: 'M', qty: -1 }]],
    ['qty over 50', [{ slug: 'yhwh', color: 'Black', size: 'M', qty: 51 }]],
    ['fractional qty', [{ slug: 'yhwh', color: 'Black', size: 'M', qty: 1.5 }]],
    ['unknown color', [{ slug: 'yhwh', color: 'Pink', size: 'M', qty: 1 }]],
    ['unknown size', [{ slug: 'yhwh', color: 'Black', size: 'XXXL', qty: 1 }]],
    ['unknown slug', [{ slug: 'nope', color: 'Black', size: 'M', qty: 1 }]],
    ['empty cart', []],
  ])('rejects %s', (_label, lines) => {
    expect(priceCart(lines, products).ok).toBe(false)
  })
  it('rejects inactive products', () => {
    expect(priceCart([{ slug: 'yhwh', color: 'Black', size: 'M', qty: 1 }], [tee({ active: false })]).ok).toBe(false)
  })
  it('rejects more than 20 lines', () => {
    const lines = Array.from({ length: 21 }, () => ({ slug: 'yhwh', color: 'Black', size: 'M', qty: 1 }))
    expect(priceCart(lines, products).ok).toBe(false)
  })
})

describe('formatOrderNumber', () => {
  it('formats with prefix', () => {
    expect(formatOrderNumber('EW', 1001)).toBe('#EW-1001')
  })
})
