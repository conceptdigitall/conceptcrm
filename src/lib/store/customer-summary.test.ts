import { describe, expect, it } from 'vitest'
import { summarizeCustomer } from './customer-summary'

describe('summarizeCustomer', () => {
  it('ignores refunded orders and finds the last purchase', () => {
    expect(summarizeCustomer([
      { total_cents: 6400, status: 'delivered', paid_at: '2026-10-01T10:00:00Z' },
      { total_cents: 3000, status: 'refunded', paid_at: '2026-11-03T10:00:00Z' },
      { total_cents: 3600, status: 'paid', paid_at: '2026-11-01T10:00:00Z' },
    ])).toEqual({ count: 2, totalCents: 10000, avgCents: 5000, lastPurchaseAt: '2026-11-01T10:00:00Z' })
  })

  it('returns zeros for no orders', () => {
    expect(summarizeCustomer([])).toEqual({ count: 0, totalCents: 0, avgCents: 0, lastPurchaseAt: null })
  })
})
