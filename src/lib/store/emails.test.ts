import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('./settings', () => ({ loadStoreSettings: mocks.load }))

import { renderOrderEmail, sendOrderEmail } from './emails'
import { fakeDb } from './test-db'

const ctx = {
  storeName: 'Essence Wear',
  orderNumber: '#EW-1001',
  customerName: '<script>alert(1)</script> Mary',
  items: [{ name: 'YHWH Tee', color: 'Black', size: 'M', qty: 2, unitCents: 3200 }],
  totalCents: 6400,
}

describe('renderOrderEmail', () => {
  it('uses the exact subjects', () => {
    expect(renderOrderEmail('confirmed', ctx).subject).toBe('Order #EW-1001 confirmed')
    expect(renderOrderEmail('shipped', ctx).subject).toBe('Your order is on the way')
    expect(renderOrderEmail('delivered', ctx).subject).toBe('Delivered!')
    expect(renderOrderEmail('refunded', ctx).subject).toBe('Your refund is on its way')
  })
  it('includes tracking on shipped', () => {
    const e = renderOrderEmail('shipped', { ...ctx, trackingNumber: '9400', trackingUrl: 'https://track.test/9400' })
    expect(e.html).toContain('https://track.test/9400')
    expect(e.text).toContain('9400')
  })
  it('asks for a review only when there is a link', () => {
    expect(renderOrderEmail('delivered', { ...ctx, reviewUrl: 'https://ig.test' }).html).toContain('https://ig.test')
    expect(renderOrderEmail('delivered', ctx).html).not.toContain('review')
  })
  it('escapes customer text', () => {
    const e = renderOrderEmail('confirmed', ctx)
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('&lt;script&gt;')
  })
  it('formats money', () => {
    expect(renderOrderEmail('confirmed', ctx).html).toContain('$64.00')
  })
})

describe('sendOrderEmail', () => {
  const order = {
    id: 'o1', account_id: 'acc', number: 1001, email: 'mary@test.com', customer_name: 'Mary', total_cents: 6400,
  }
  const db = () => fakeDb({
    orders: [order],
    order_items: [{ order_id: 'o1', product_name: 'YHWH Tee', color: 'Black', size: 'M', quantity: 2, unit_cents: 3200 }],
    shipments: [],
  })
  const settings = (emailFrom: string | null) => ({
    settings: { storeName: 'Essence Wear', orderPrefix: 'EW', emailFrom, reviewUrl: null },
    secrets: { resendApiKey: 're_1' },
  })

  beforeEach(() => {
    vi.unstubAllGlobals()
    mocks.load.mockReset()
  })

  it('skips without a sender address and logs it', async () => {
    mocks.load.mockResolvedValue(settings(null))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const d = db()
    expect(await sendOrderEmail(d as never, 'acc', 'o1', 'confirmed')).toBe('skipped')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(d.tables.order_events.at(-1)).toMatchObject({ type: 'email_skipped', detail: { kind: 'confirmed' } })
  })

  it('sends through Resend', async () => {
    mocks.load.mockResolvedValue(settings('orders@essencewear.test'))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const d = db()
    expect(await sendOrderEmail(d as never, 'acc', 'o1', 'confirmed')).toBe('sent')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_1')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ from: 'Essence Wear <orders@essencewear.test>', to: ['mary@test.com'], subject: 'Order #EW-1001 confirmed' })
    expect(d.tables.order_events.at(-1)).toMatchObject({ type: 'email_sent', detail: { kind: 'confirmed', id: 'em_1' } })
  })

  it('records a failure', async () => {
    mocks.load.mockResolvedValue(settings('orders@essencewear.test'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))
    const d = db()
    expect(await sendOrderEmail(d as never, 'acc', 'o1', 'confirmed')).toBe('failed')
    expect(d.tables.order_events.at(-1)).toMatchObject({ type: 'email_failed', detail: { kind: 'confirmed', status: 500 } })
  })
})
