import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/store/test-db'

const ACC = 'acc-store'
const mocks = vi.hoisted(() => ({
  db: null as unknown, buyLabel: vi.fn(), getRates: vi.fn(), getRate: vi.fn(), requireRole: vi.fn(), getCurrentAccount: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: vi.fn(() => Response.json({ error: 'x' }, { status: 500 })),
}))
vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => mocks.db }))
vi.mock('@/lib/store/settings', () => ({
  loadStoreSettings: async () => ({
    settings: {
      accountId: ACC, storeName: 'Essence Wear', orderPrefix: 'EW',
      senderAddress: { name: 'Leo', street1: '2 Elm', city: 'Boston', state: 'MA', zip: '02102', country: 'US' },
      box: { length: 10, width: 8, height: 2, weight_oz: 2 },
    },
    secrets: { shippoApiKey: 'shippo_test_1' },
  }),
}))
vi.mock('@/lib/store/shippo', async (orig) => ({
  ...(await orig<typeof import('@/lib/store/shippo')>()),
  buyLabel: mocks.buyLabel,
  getRates: mocks.getRates,
  getRate: mocks.getRate,
}))

import { POST } from './route'
import { GET as GET_RATES } from '../rates/route'
import { ShippoError } from '@/lib/store/shippo'

const order = (status: string) => ({
  id: 'o1', account_id: ACC, status, number: 1001,
  shipping_address: { name: 'Mary', street1: '1 Main', city: 'Boston', state: 'MA', zip: '02101', country: 'US' },
})
const ctx = { params: Promise.resolve({ id: 'o1' }) }
const post = () => new Request('http://crm.test/x', { method: 'POST', body: JSON.stringify({ rateId: 'r_usps' }) })

describe('label + rates routes', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    mocks.requireRole.mockReset().mockResolvedValue({ accountId: ACC, role: 'agent' })
    mocks.getCurrentAccount.mockReset().mockResolvedValue({ accountId: ACC, role: 'agent' })
    mocks.buyLabel.mockReset().mockResolvedValue({
      transactionId: 'tx_1', trackingNumber: '9400', trackingUrl: 'https://t.test/9400', labelUrl: 'https://l.test/1.pdf', eta: null,
    })
    mocks.getRate.mockReset().mockResolvedValue({ id: 'r_usps', carrier: 'USPS', service: 'Ground', amount_cents: 525, days: 4 })
    mocks.getRates.mockReset().mockResolvedValue([{ id: 'r_usps', carrier: 'USPS', service: 'Ground', amount_cents: 525, days: 4 }])
    mocks.db = fakeDb({
      orders: [order('preparing')],
      order_items: [{ order_id: 'o1', product_id: 'p1', quantity: 2 }],
      store_products: [{ id: 'p1', account_id: ACC, weight_oz: 6 }],
      shipments: [],
    })
  })
  const tables = () => (mocks.db as ReturnType<typeof fakeDb>).tables

  it('quotes with items weight plus the empty box', async () => {
    const res = await GET_RATES(new Request('http://crm.test/x'), ctx)
    expect(res.status).toBe(200)
    expect(mocks.getRates.mock.calls[0][1].parcel).toEqual({ length: 10, width: 8, height: 2, weight_oz: 14 })
    expect(mocks.getRates.mock.calls[0][1].to).toMatchObject({ street1: '1 Main', zip: '02101' })
  })

  it('buys the label, stores the shipment and moves to label_ready', async () => {
    const res = await POST(post(), ctx)
    expect(res.status).toBe(200)
    expect(tables().shipments[0]).toMatchObject({
      order_id: 'o1', tracking_number: '9400', label_url: 'https://l.test/1.pdf', shippo_transaction_id: 'tx_1',
      carrier: 'USPS', cost_cents: 525,
    })
    expect(tables().orders[0].status).toBe('label_ready')
    expect(tables().order_events.map((e) => e.type)).toContain('label_bought')
  })

  it('refuses a label before preparing', async () => {
    mocks.db = fakeDb({ orders: [order('paid')], order_items: [], store_products: [], shipments: [] })
    expect((await POST(post(), ctx)).status).toBe(409)
    expect(mocks.buyLabel).not.toHaveBeenCalled()
  })

  it('never buys a second label', async () => {
    await POST(post(), ctx)
    tables().orders[0].status = 'preparing'
    expect((await POST(post(), ctx)).status).toBe(409)
    expect(mocks.buyLabel).toHaveBeenCalledTimes(1)
  })

  it('buys only one label when two requests race', async () => {
    let release: () => void = () => {}
    mocks.buyLabel.mockImplementation(() => new Promise((r) => {
      release = () => r({ transactionId: 'tx_1', trackingNumber: '9400', trackingUrl: null, labelUrl: 'https://l.test/1.pdf', eta: null })
    }))
    const a = POST(post(), ctx)
    const b = POST(post(), ctx)
    await new Promise((r) => setTimeout(r, 20))
    release()
    const statuses = (await Promise.all([a, b])).map((r) => r.status).sort()
    expect(statuses).toEqual([200, 409])
    expect(mocks.buyLabel).toHaveBeenCalledTimes(1)
    expect(tables().shipments).toHaveLength(1)
  })

  it('frees the order for a new try when Shippo fails', async () => {
    mocks.buyLabel.mockRejectedValueOnce(new ShippoError('label failed', ['x']))
    expect((await POST(post(), ctx)).status).toBe(502)
    expect(tables().shipments).toHaveLength(0)
    expect((await POST(post(), ctx)).status).toBe(200)
  })

  it('keeps the status and logs when Shippo fails', async () => {
    mocks.buyLabel.mockRejectedValue(new ShippoError('label failed', ['Address not found']))
    const res = await POST(post(), ctx)
    expect(res.status).toBe(502)
    expect((await res.json()).messages).toEqual(['Address not found'])
    expect(tables().orders[0].status).toBe('preparing')
    expect(tables().order_events.map((e) => e.type)).toContain('label_failed')
  })

  it('hides other accounts orders', async () => {
    mocks.db = fakeDb({ orders: [{ ...order('preparing'), account_id: 'other' }], shipments: [] })
    expect((await POST(post(), ctx)).status).toBe(404)
  })
})
