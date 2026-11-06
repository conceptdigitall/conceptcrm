import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/store/test-db'

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), getCurrentAccount: vi.fn(), db: null as unknown }))
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: vi.fn(() => Response.json({ error: 'x' }, { status: 500 })),
}))
vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => mocks.db }))

import { GET, POST } from './route'
import { PATCH } from './[id]/route'

const ACC = 'acc-store'
const json = (method: string, body: unknown) => new Request('http://crm.test/x', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const valid = { slug: 'yhwh', name: 'YHWH Tee', priceCents: 3200, colors: ['Black'], sizes: ['M', 'L'], weightOz: 6 }

describe('/api/loja/products', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    mocks.db = fakeDb({ store_products: [{ id: 'p-other', account_id: 'other', slug: 'x', name: 'X', price_cents: 1 }] })
    mocks.requireRole.mockReset().mockResolvedValue({ accountId: ACC, role: 'admin' })
    mocks.getCurrentAccount.mockReset().mockResolvedValue({ accountId: ACC, role: 'agent' })
  })

  it('creates a product and lists only this account', async () => {
    expect((await POST(json('POST', valid))).status).toBe(201)
    const { products } = await (await GET()).json()
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ slug: 'yhwh', price_cents: 3200, weight_oz: 6 })
  })

  it.each([
    ['negative price', { ...valid, priceCents: -1 }],
    ['fractional cents', { ...valid, priceCents: 10.5 }],
    ['bad slug', { ...valid, slug: 'Has Spaces' }],
    ['no sizes', { ...valid, sizes: [] }],
  ])('rejects %s', async (_l, body) => {
    expect((await POST(json('POST', body))).status).toBe(400)
  })

  it('requires admin to create', async () => {
    await POST(json('POST', valid))
    expect(mocks.requireRole).toHaveBeenCalledWith('admin')
  })

  it('cannot edit another account product', async () => {
    const res = await PATCH(json('PATCH', { active: false }), { params: Promise.resolve({ id: 'p-other' }) })
    expect(res.status).toBe(404)
  })
})
