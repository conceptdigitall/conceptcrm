import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/store/test-db'

const ACC = 'acc-store'
const mocks = vi.hoisted(() => ({ db: null as unknown, getCurrentAccount: vi.fn(), requireRole: vi.fn() }))

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: vi.fn(() => Response.json({ error: 'x' }, { status: 500 })),
}))
vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => mocks.db }))
vi.mock('@/lib/store/settings', () => ({
  loadStoreSettings: async () => ({
    settings: { accountId: ACC, orderPrefix: 'EW', emailFrom: null },
    secrets: { stripeSecretKey: 'sk', shippoApiKey: null },
  }),
}))

import { GET as LIST } from './route'
import { GET as DETAIL } from './[id]/route'

describe('orders list + detail', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    mocks.getCurrentAccount.mockReset().mockResolvedValue({ accountId: ACC, role: 'viewer' })
    mocks.db = fakeDb({
      orders: [
        { id: 'o1', account_id: ACC, number: 1001, status: 'paid', created_at: '2026-11-06T10:00:00Z' },
        { id: 'o2', account_id: 'other', number: 1001, status: 'paid', created_at: '2026-11-06T10:00:00Z' },
      ],
      order_items: [{ id: 'i1', order_id: 'o1', product_name: 'YHWH Tee', color: 'Black', size: 'M', quantity: 1, unit_cents: 3200 }],
      shipments: [],
      order_events: [{ id: 'e1', order_id: 'o1', account_id: ACC, type: 'paid', created_at: '2026-11-06T10:00:00Z' }],
    })
  })

  it('lists only this account orders, with items and display number', async () => {
    const body = await (await LIST(new Request('http://crm.test/api/loja/orders'))).json()
    expect(body.orders).toHaveLength(1)
    expect(body.orders[0]).toMatchObject({ id: 'o1', display_number: '#EW-1001', items: [expect.objectContaining({ product_name: 'YHWH Tee' })] })
    expect(body.config).toEqual({ emailsEnabled: false, hasShippo: false, hasStripe: true })
  })

  it('returns the order detail with timeline', async () => {
    const body = await (await DETAIL(new Request('http://crm.test/x'), { params: Promise.resolve({ id: 'o1' }) })).json()
    expect(body.order.display_number).toBe('#EW-1001')
    expect(body.events.map((e: { type: string }) => e.type)).toEqual(['paid'])
    expect(body.shipment).toBeNull()
  })

  it('hides another account order', async () => {
    const res = await DETAIL(new Request('http://crm.test/x'), { params: Promise.resolve({ id: 'o2' }) })
    expect(res.status).toBe(404)
  })
})
