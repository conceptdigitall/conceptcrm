import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/store/test-db'

const ACC = 'acc-store'
const mocks = vi.hoisted(() => ({ db: null as unknown, sendOrderEmail: vi.fn() }))

vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => mocks.db }))
vi.mock('@/lib/store/emails', () => ({ sendOrderEmail: mocks.sendOrderEmail }))
vi.mock('@/lib/store/settings', () => ({
  loadStoreSettings: async () => ({ settings: { accountId: ACC }, secrets: { shippoWebhookToken: 'tok_123' } }),
}))

import { POST } from './route'

const hook = (status: string, token = 'tok_123', date = '2026-11-10T15:00:00Z') =>
  new Request(`http://crm.test/api/loja/webhooks/shippo?token=${token}`, {
    method: 'POST',
    body: JSON.stringify({
      event: 'track_updated',
      test: true,
      data: {
        tracking_number: '9400', carrier: 'usps', eta: '2026-11-12T00:00:00Z',
        tracking_status: { status, status_date: date, status_details: 'x' },
      },
    }),
  })

describe('POST /api/loja/webhooks/shippo', () => {
  beforeEach(() => {
    vi.stubEnv('CRM_ACCOUNT_ID', ACC)
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    mocks.sendOrderEmail.mockReset().mockResolvedValue('sent')
    mocks.db = fakeDb({
      orders: [{ id: 'o1', account_id: ACC, status: 'shipped' }],
      shipments: [{ id: 's1', account_id: ACC, order_id: 'o1', tracking_number: '9400' }],
    })
  })
  const tables = () => (mocks.db as ReturnType<typeof fakeDb>).tables

  it('rejects a wrong token', async () => {
    expect((await POST(hook('DELIVERED', 'nope'))).status).toBe(401)
  })

  it('updates tracking on transit', async () => {
    expect((await POST(hook('TRANSIT'))).status).toBe(200)
    expect(tables().shipments[0]).toMatchObject({ tracking_status: 'TRANSIT', eta: '2026-11-12T00:00:00Z' })
    expect(tables().orders[0].status).toBe('shipped')
  })

  it('marks delivered and emails once even if the hook repeats', async () => {
    await POST(hook('DELIVERED'))
    await POST(hook('DELIVERED'))
    expect(tables().orders[0].status).toBe('delivered')
    expect(tables().orders[0].delivered_at).toBeTruthy()
    expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(expect.anything(), ACC, 'o1', 'delivered')
  })

  it('ignores unknown tracking numbers', async () => {
    mocks.db = fakeDb({ orders: [], shipments: [] })
    expect((await POST(hook('DELIVERED'))).status).toBe(200)
  })
})
