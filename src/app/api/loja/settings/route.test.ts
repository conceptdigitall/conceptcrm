import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/store/test-db'

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), getCurrentAccount: vi.fn(), db: null as unknown }))

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: vi.fn((err: { status?: number }) =>
    Response.json({ error: 'auth failed' }, { status: err?.status ?? 500 })),
}))
vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => mocks.db }))
vi.mock('@/lib/whatsapp/encryption', () => ({
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\((.*)\)$/, '$1'),
}))

import { GET, PUT } from './route'

const ACC = 'acc-store'
const put = (body: unknown) => new Request('http://crm.test/api/loja/settings', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

describe('/api/loja/settings', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    mocks.db = fakeDb({})
    mocks.requireRole.mockReset().mockResolvedValue({ accountId: ACC, role: 'admin' })
    mocks.getCurrentAccount.mockReset().mockResolvedValue({ accountId: ACC, role: 'agent' })
  })

  it('saves settings, encrypts keys and never returns them', async () => {
    const res = await PUT(put({ storeName: 'Essence Wear', orderPrefix: 'EW', siteUrl: 'https://shop.test', secrets: { stripeSecretKey: 'sk_test_1' } }))
    expect(res.status).toBe(200)
    const db = mocks.db as ReturnType<typeof fakeDb>
    expect(db.tables.store_secrets[0].stripe_secret_key_enc).toBe('enc(sk_test_1)')

    const got = await (await GET()).json()
    expect(got.settings.storeName).toBe('Essence Wear')
    expect(got.flags.hasStripeKey).toBe(true)
    expect(JSON.stringify(got)).not.toContain('sk_test_1')
  })

  it('requires admin to save', async () => {
    await PUT(put({ storeName: 'X' }))
    expect(mocks.requireRole).toHaveBeenCalledWith('admin')
  })

  it('rejects a missing store name', async () => {
    expect((await PUT(put({ storeName: ' ' }))).status).toBe(400)
  })

  it('hides the module from non-store accounts', async () => {
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', 'other')
    expect((await GET()).status).toBe(404)
    expect((await PUT(put({ storeName: 'X' }))).status).toBe(404)
  })
})
