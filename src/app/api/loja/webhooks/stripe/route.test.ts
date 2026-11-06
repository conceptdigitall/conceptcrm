import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/store/test-db'

const SECRET = 'whsec_test_123'
const ACC = 'acc-store'

const mocks = vi.hoisted(() => ({ db: null as unknown, listLineItems: vi.fn(), sendOrderEmail: vi.fn() }))

vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => mocks.db }))
vi.mock('@/lib/store/settings', () => ({
  loadStoreSettings: async () => ({
    settings: { accountId: ACC, storeName: 'Essence Wear', orderPrefix: 'EW' },
    secrets: { stripeSecretKey: 'sk_test_1', stripeWebhookSecret: SECRET },
  }),
}))
vi.mock('@/lib/store/emails', () => ({ sendOrderEmail: mocks.sendOrderEmail }))
vi.mock('@/lib/store/stripe', async () => {
  const { default: RealStripe } = await import('stripe')
  const real = new RealStripe('sk_test_1')
  return {
    getStripe: () => ({ webhooks: real.webhooks, checkout: { sessions: { listLineItems: mocks.listLineItems } } }),
  }
})

import { POST } from './route'

const stripe = new Stripe('sk_test_1')

function signed(event: object, secret = SECRET) {
  const payload = JSON.stringify(event)
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
  return new Request('http://crm.test/api/loja/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': header, 'Content-Type': 'application/json' },
    body: payload,
  })
}

const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs_test_1',
  object: 'checkout.session',
  payment_status: 'paid',
  payment_intent: 'pi_1',
  amount_subtotal: 6400,
  amount_total: 7000,
  total_details: { amount_tax: 0, amount_shipping: 600 },
  metadata: { account_id: ACC },
  customer_details: {
    name: 'Mary Smith', email: 'mary@test.com', phone: '+16175550100',
    address: { line1: '1 Main St', line2: null, city: 'Boston', state: 'MA', postal_code: '02101', country: 'US' },
  },
  collected_information: {
    shipping_details: {
      name: 'Mary Smith',
      address: { line1: '1 Main St', line2: null, city: 'Boston', state: 'MA', postal_code: '02101', country: 'US' },
    },
  },
  ...over,
})

const completed = (s = session(), id = 'evt_1') => ({
  id, object: 'event', type: 'checkout.session.completed', data: { object: s },
})

const lineItems = {
  data: [{
    quantity: 2,
    amount_subtotal: 6400,
    price: { unit_amount: 3200, product: { metadata: { slug: 'yhwh', color: 'Black', size: 'M' }, name: 'YHWH Tee — Black / M' } },
  }],
}

function db(extra: Record<string, Record<string, unknown>[]> = {}, opts: { failInsert?: (t: string) => boolean } = {}) {
  let next = 1001
  return fakeDb(
    {
      accounts: [{ id: ACC, owner_user_id: 'owner-1' }],
      store_products: [{ id: 'p1', account_id: ACC, slug: 'yhwh', name: 'YHWH Tee', price_cents: 3200, active: true }],
      contacts: [],
      ...extra,
    },
    { store_next_order_number: () => next++ },
    opts,
  )
}

describe('POST /api/loja/webhooks/stripe', () => {
  beforeEach(() => {
    vi.stubEnv('CRM_ACCOUNT_ID', ACC)
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    mocks.db = db()
    mocks.listLineItems.mockReset().mockResolvedValue(lineItems)
    mocks.sendOrderEmail.mockReset().mockResolvedValue('skipped')
  })

  const tables = () => (mocks.db as ReturnType<typeof fakeDb>).tables

  it('rejects a bad signature', async () => {
    const res = await POST(signed(completed(), 'whsec_wrong'))
    expect(res.status).toBe(400)
    expect(tables().orders ?? []).toHaveLength(0)
  })

  it('creates one paid order with frozen items and a contact', async () => {
    const res = await POST(signed(completed()))
    expect(res.status).toBe(200)
    const [order] = tables().orders
    expect(order).toMatchObject({
      account_id: ACC, number: 1001, status: 'paid', email: 'mary@test.com', customer_name: 'Mary Smith',
      subtotal_cents: 6400, shipping_cents: 600, total_cents: 7000, payment_ref: 'cs_test_1', payment_intent: 'pi_1',
    })
    expect(order.shipping_address).toMatchObject({ street1: '1 Main St', city: 'Boston', state: 'MA', zip: '02101' })
    expect(tables().order_items).toEqual([
      expect.objectContaining({ product_slug: 'yhwh', product_name: 'YHWH Tee', color: 'Black', size: 'M', quantity: 2, unit_cents: 3200, product_id: 'p1' }),
    ])
    expect(tables().contacts[0]).toMatchObject({ account_id: ACC, user_id: 'owner-1', email: 'mary@test.com', phone: '+16175550100' })
    expect(order.contact_id).toBe(tables().contacts[0].id)
    expect(mocks.listLineItems).toHaveBeenCalledWith('cs_test_1', expect.objectContaining({ expand: ['data.price.product'] }))
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(expect.anything(), ACC, order.id, 'confirmed')
  })

  it('processes a repeated event only once', async () => {
    await POST(signed(completed()))
    const again = await POST(signed(completed()))
    expect(again.status).toBe(200)
    expect(tables().orders).toHaveLength(1)
    expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1)
  })

  it('does not duplicate the order when Stripe resends the session under a new event id', async () => {
    await POST(signed(completed()))
    await POST(signed(completed(session(), 'evt_2')))
    expect(tables().orders).toHaveLength(1)
  })

  it('creates the contact with an empty phone when the buyer gave none', async () => {
    const s = session({ customer_details: { ...session().customer_details, phone: null } })
    await POST(signed(completed(s)))
    expect(tables().contacts[0].phone).toBe('')
  })

  it('reuses an existing contact with the same email', async () => {
    mocks.db = db({ contacts: [{ id: 'c-old', account_id: ACC, email: 'Mary@Test.com', phone: '' }] })
    await POST(signed(completed()))
    expect(tables().contacts).toHaveLength(1)
    expect(tables().orders[0].contact_id).toBe('c-old')
  })

  it('ignores unpaid sessions', async () => {
    await POST(signed(completed(session({ payment_status: 'unpaid' }))))
    expect(tables().orders ?? []).toHaveLength(0)
  })

  it('flags a total that does not match the catalog', async () => {
    mocks.listLineItems.mockResolvedValue({
      data: [{ ...lineItems.data[0], amount_subtotal: 200, price: { ...lineItems.data[0].price, unit_amount: 100 } }],
    })
    await POST(signed(completed(session({ amount_subtotal: 200 }))))
    expect(tables().order_events.map((e) => e.type)).toContain('amount_mismatch')
  })

  const refundEvt = (refunded: boolean, id = 'evt_r') => ({
    id, object: 'event', type: 'charge.refunded',
    data: { object: { id: 'ch_1', payment_intent: 'pi_1', refunded, amount_refunded: refunded ? 7000 : 1500 } },
  })

  it('only logs a partial refund', async () => {
    await POST(signed(completed()))
    await POST(signed(refundEvt(false)))
    expect(tables().orders[0].status).toBe('paid')
    expect(tables().order_events.map((e) => e.type)).toContain('partial_refund')
    expect(mocks.sendOrderEmail).not.toHaveBeenCalledWith(expect.anything(), ACC, expect.anything(), 'refunded')
  })

  it('does not email the refund twice when the order is already refunded', async () => {
    await POST(signed(completed()))
    tables().orders[0].status = 'refunded'
    await POST(signed(refundEvt(true)))
    expect(mocks.sendOrderEmail).not.toHaveBeenCalledWith(expect.anything(), ACC, expect.anything(), 'refunded')
  })

  it('creates the order from a delayed payment that succeeds later', async () => {
    await POST(signed(completed(session({ payment_status: 'unpaid' }))))
    expect(tables().orders ?? []).toHaveLength(0)
    await POST(signed({ id: 'evt_async', object: 'event', type: 'checkout.session.async_payment_succeeded', data: { object: session() } }))
    expect(tables().orders).toHaveLength(1)
    expect(tables().orders[0].status).toBe('paid')
  })

  it('lets Stripe retry when the items fail to save, then repairs items and email', async () => {
    let fail = true
    mocks.db = db({}, { failInsert: (t) => t === 'order_items' && fail })
    const first = await POST(signed(completed()))
    expect(first.status).toBe(500)
    fail = false
    const retry = await POST(signed(completed()))
    expect(retry.status).toBe(200)
    expect(tables().orders).toHaveLength(1)
    expect(tables().order_items).toHaveLength(1)
    expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1)
  })

  it('does not attach the order to a contact whose email only matches a wildcard', async () => {
    mocks.db = db({ contacts: [{ id: 'c-other', account_id: ACC, email: 'johnxdoe@test.com', phone: '' }] })
    const s = session({ customer_details: { ...session().customer_details, email: 'john_doe@test.com' } })
    await POST(signed(completed(s)))
    expect(tables().orders[0].contact_id).not.toBe('c-other')
  })

  it('ignores a refund for an unknown order', async () => {
    const res = await POST(signed({ id: 'evt_r', object: 'event', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_nope' } } }))
    expect(res.status).toBe(200)
  })

  it('marks a refunded order and emails the buyer', async () => {
    await POST(signed(completed()))
    await POST(signed({ id: 'evt_r', object: 'event', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_1', refunded: true } } }))
    expect(tables().orders[0].status).toBe('refunded')
    expect(mocks.sendOrderEmail).toHaveBeenLastCalledWith(expect.anything(), ACC, tables().orders[0].id, 'refunded')
  })

  it('does not refund-flip a shipped order, only logs it', async () => {
    await POST(signed(completed()))
    tables().orders[0].status = 'shipped'
    await POST(signed({ id: 'evt_r', object: 'event', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_1', refunded: true } } }))
    expect(tables().orders[0].status).toBe('shipped')
    expect(tables().order_events.map((e) => e.type)).toContain('refund_after_ship')
  })
})
