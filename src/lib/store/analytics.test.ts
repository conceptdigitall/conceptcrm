import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadStoreAnalytics, lowConversion, percentChange } from './analytics'

describe('lowConversion', () => {
  it('keeps products seen a lot and bought little, most viewed first', () => {
    const r = lowConversion([
      { slug: 'a', views: 100, spins: 0, adds: 0, sold_qty: 1 },
      { slug: 'b', views: 50, spins: 0, adds: 0, sold_qty: 10 },
      { slug: 'c', views: 10, spins: 0, adds: 0, sold_qty: 0 },
      { slug: 'd', views: 300, spins: 0, adds: 0, sold_qty: 0 },
    ])
    expect(r.map((p) => p.slug)).toEqual(['d', 'a'])
  })
})

describe('percentChange', () => {
  it('handles a zero baseline', () => {
    expect(percentChange(10, 0)).toBeNull()
    expect(percentChange(15, 10)).toBe(50)
    expect(percentChange(5, 10)).toBe(-50)
  })
})

describe('loadStoreAnalytics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('asks for the period and the same-length period before it', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { visits: 1 }, error: null })
    const r = await loadStoreAnalytics({ rpc } as never, 'acc', 30)
    expect(rpc).toHaveBeenNthCalledWith(1, 'store_analytics', {
      p_account: 'acc', p_from: '2026-10-07T12:00:00.000Z', p_to: '2026-11-06T12:00:00.000Z',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'store_analytics', {
      p_account: 'acc', p_from: '2026-09-07T12:00:00.000Z', p_to: '2026-10-07T12:00:00.000Z',
    })
    expect(r.current.visits).toBe(1)
  })

  it('throws when the database fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(loadStoreAnalytics({ rpc } as never, 'acc', 7)).rejects.toThrow('boom')
  })
})
