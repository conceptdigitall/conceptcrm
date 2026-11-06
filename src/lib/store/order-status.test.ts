import { describe, expect, it } from 'vitest'
import { nextStatus } from './order-status'

describe('nextStatus', () => {
  it('walks the happy path', () => {
    expect(nextStatus('paid', 'start_preparing')).toBe('preparing')
    expect(nextStatus('preparing', 'label_bought')).toBe('label_ready')
    expect(nextStatus('label_ready', 'mark_shipped')).toBe('shipped')
    expect(nextStatus('shipped', 'mark_delivered')).toBe('delivered')
  })
  it('allows refunds only before shipping', () => {
    expect(nextStatus('paid', 'refund')).toBe('refunded')
    expect(nextStatus('preparing', 'refund')).toBe('refunded')
    expect(nextStatus('label_ready', 'refund')).toBe('refunded')
    expect(nextStatus('shipped', 'refund')).toBeNull()
  })
  it('rejects skipped or backwards steps', () => {
    expect(nextStatus('paid', 'mark_shipped')).toBeNull()
    expect(nextStatus('delivered', 'start_preparing')).toBeNull()
    expect(nextStatus('preparing', 'start_preparing')).toBeNull()
  })
})
