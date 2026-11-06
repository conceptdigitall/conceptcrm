import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/store/test-db'

const ACC = 'acc-store'
const mocks = vi.hoisted(() => ({
  db: null as unknown, requireRole: vi.fn(), getCurrentAccount: vi.fn(),
  sendOrderEmail: vi.fn(), refundsCreate: vi.fn(), refundLabel: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: vi.fn(() => Response.json({ error: 'x' }, { status: 500 })),
}))
vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => mocks.db }))
vi.mock('@/lib/store/emails', () => ({ sendOrderEmail: mocks.sendOrderEmail }))
vi.mock('@/lib/store/settings', () => ({
  loadStoreSettings: async () => ({ settings: { accountId: ACC }, secrets: { stripeSecretKey: 'sk_test_1', shippoApiKey: 'shippo_1' } }),
}))
vi.mock('@/lib/store/stripe', () => ({ getStripe: () => ({ refunds: { create: mocks.refundsCreate } }) }))
vi.mock('@/lib/store/shippo', async (orig) => ({
  ...(await orig<typeof import('@/lib/store/shippo')>()),
  refundLabel: mocks.refundLabel,
}))

import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'o1' }) }
const act = (body: unknown) => new Request('http://crm.test/x', { method: 'POST', body: JSON.stringify(body) })
const order = (status: string, extra: Record<string, unknown> = {}) =>
  ({ id: 'o1', account_id: ACC, status, number: 1001, payment_intent: 'pi_1', ...extra })

describe('POST /api/loja/orders/[id]/actions', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    mocks.requireRole.mockReset().mockResolvedValue({ accountId: ACC, role: 'agent' })
    mocks.getCurrentAccount.mockReset().mockResolvedValue({ accountId: ACC, role: 'agent' })
    mocks.sendOrderEmail.mockReset().mockResolvedValue('sent')
    mocks.refundsCreate.mockReset().mockResolvedValue({ id: 're_1' })
    mocks.refundLabel.mockReset().mockResolvedValue(undefined)
    mocks.db = fakeDb({ orders: [order('paid')], shipments: [] })
  })
  const tables = () => (mocks.db as ReturnType<typeof fakeDb>).tables

  it('starts preparing, then refuses the same action again', async () => {
    expect((await POST(act({ action: 'start_preparing' }), ctx)).status).toBe(200)
    expect(tables().orders[0].status).toBe('preparing')
    expect((await POST(act({ action: 'start_preparing' }), ctx)).status).toBe(409)
  })

  it('marks shipped and emails the buyer', async () => {
    mocks.db = fakeDb({ orders: [order('label_ready')], shipments: [{ order_id: 'o1', tracking_number: '9400' }] })
    expect((await POST(act({ action: 'mark_shipped' }), ctx)).status).toBe(200)
    expect(tables().orders[0].status).toBe('shipped')
    expect(tables().orders[0].shipped_at).toBeTruthy()
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(expect.anything(), ACC, 'o1', 'shipped')
  })

  it('refunds through Stripe with the order payment intent and voids the label', async () => {
    mocks.db = fakeDb({ orders: [order('label_ready')], shipments: [{ order_id: 'o1', shippo_transaction_id: 'tx_1' }] })
    expect((await POST(act({ action: 'refund' }), ctx)).status).toBe(200)
    expect(mocks.refundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_1' })
    expect(mocks.refundLabel).toHaveBeenCalledWith('shippo_1', 'tx_1')
    expect(tables().orders[0].status).toBe('refunded')
  })

  it('still refunds when voiding the label fails', async () => {
    mocks.db = fakeDb({ orders: [order('label_ready')], shipments: [{ order_id: 'o1', shippo_transaction_id: 'tx_1' }] })
    mocks.refundLabel.mockRejectedValue(new Error('shippo down'))
    expect((await POST(act({ action: 'refund' }), ctx)).status).toBe(200)
    expect(tables().order_events.map((e) => e.type)).toContain('label_refund_failed')
  })

  it('keeps the order when Stripe refuses the refund', async () => {
    mocks.refundsCreate.mockRejectedValue(new Error('card_declined'))
    expect((await POST(act({ action: 'refund' }), ctx)).status).toBe(502)
    expect(tables().orders[0].status).toBe('paid')
  })

  it('cannot refund a shipped order', async () => {
    mocks.db = fakeDb({ orders: [order('shipped')], shipments: [] })
    expect((await POST(act({ action: 'refund' }), ctx)).status).toBe(409)
    expect(mocks.refundsCreate).not.toHaveBeenCalled()
  })

  it('resends an email of an allowed kind', async () => {
    expect((await POST(act({ action: 'resend_email', kind: 'confirmed' }), ctx)).status).toBe(200)
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(expect.anything(), ACC, 'o1', 'confirmed')
    expect((await POST(act({ action: 'resend_email', kind: 'hack' }), ctx)).status).toBe(400)
  })

  it('rejects unknown actions', async () => {
    expect((await POST(act({ action: 'mark_delivered' }), ctx)).status).toBe(400)
  })

  it('treats another account order as missing', async () => {
    mocks.db = fakeDb({ orders: [{ ...order('paid'), account_id: 'other' }] })
    expect((await POST(act({ action: 'start_preparing' }), ctx)).status).toBe(404)
  })
})
