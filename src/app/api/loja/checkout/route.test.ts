import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  load: vi.fn(),
  products: vi.fn(),
}))

vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => ({}) }))
vi.mock('@/lib/store/settings', () => ({ loadStoreSettings: mocks.load }))
vi.mock('@/lib/store/catalog', () => ({ loadActiveProducts: mocks.products }))
vi.mock('@/lib/store/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.create } } }),
}))

import { OPTIONS, POST } from './route'

const ACC = 'acc-store'
const SITE = 'https://essencewear.test'
const product = {
  id: 'p1', slug: 'yhwh', name: 'YHWH Tee', price_cents: 3200, colors: ['Black'], sizes: ['M'],
  weight_oz: 6, image_url: null, active: true,
}
const req = (body: unknown, origin = SITE) =>
  new Request('http://crm.test/api/loja/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })

describe('POST /api/loja/checkout', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('CRM_ACCOUNT_ID', ACC)
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    mocks.create.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/s1' })
    mocks.load.mockReset().mockResolvedValue({
      settings: { accountId: ACC, storeName: 'Essence Wear', orderPrefix: 'EW', siteUrl: SITE },
      secrets: { stripeSecretKey: 'sk_test_1' },
    })
    mocks.products.mockReset().mockResolvedValue([product])
  })

  it('creates a Stripe session priced from the database, ignoring client prices', async () => {
    const res = await POST(req({ lines: [{ slug: 'yhwh', color: 'Black', size: 'M', qty: 2, price: 1 }] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/s1' })
    const args = mocks.create.mock.calls[0][0]
    expect(args.line_items[0].price_data.unit_amount).toBe(3200)
    expect(args.line_items[0].quantity).toBe(2)
    expect(args.mode).toBe('payment')
    expect(args.phone_number_collection).toEqual({ enabled: true })
    expect(args.shipping_address_collection).toEqual({ allowed_countries: ['US'] })
    expect(args.metadata).toEqual({ account_id: ACC })
    expect(args.line_items[0].price_data.product_data.metadata).toEqual({ slug: 'yhwh', color: 'Black', size: 'M' })
    expect(args.success_url).toBe(`${SITE}?checkout=success`)
    expect(args.cancel_url).toBe(`${SITE}?checkout=cancel`)
    expect(args.payment_method_types).toBeUndefined()
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
  })

  it('rejects an invalid cart without calling Stripe', async () => {
    const res = await POST(req({ lines: [{ slug: 'yhwh', color: 'Black', size: 'M', qty: 0 }] }))
    expect(res.status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed body', async () => {
    const res = await POST(new Request('http://crm.test/api/loja/checkout', { method: 'POST', body: 'nope', headers: { Origin: SITE } }))
    expect(res.status).toBe(400)
  })

  it('answers 503 when the deploy has no account', async () => {
    vi.stubEnv('CRM_ACCOUNT_ID', '')
    expect((await POST(req({ lines: [] }))).status).toBe(503)
  })

  it('answers 404 when the account is not a store', async () => {
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', 'someone-else')
    expect((await POST(req({ lines: [] }))).status).toBe(404)
  })

  it('answers 503 when Stripe is not configured', async () => {
    mocks.load.mockResolvedValue({ settings: { siteUrl: SITE }, secrets: { stripeSecretKey: null } })
    expect((await POST(req({ lines: [{ slug: 'yhwh', color: 'Black', size: 'M', qty: 1 }] }))).status).toBe(503)
  })

  it('does not echo a foreign origin', async () => {
    const res = await POST(req({ lines: [{ slug: 'yhwh', color: 'Black', size: 'M', qty: 1 }] }, 'https://evil.test'))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('answers the CORS preflight', async () => {
    const res = await OPTIONS(new Request('http://crm.test/api/loja/checkout', { method: 'OPTIONS', headers: { Origin: SITE } }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })
})
