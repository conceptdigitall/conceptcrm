import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/store/test-db'
import { __resetRateLimitForTests } from '@/lib/rate-limit'

const ACC = 'acc-store'
const mocks = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => mocks.db }))
vi.mock('@/lib/store/settings', () => ({
  loadStoreSettings: async () => ({ settings: { siteUrl: 'https://shop.test' }, secrets: {} }),
}))

import { POST } from './route'

const send = (ip = '9.9.9.9', body: unknown = { events: [{ visitor_id: 'v1', session_id: 's1', type: 'page_view' }] }) =>
  new Request('http://crm.test/api/loja/track', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, Origin: 'https://shop.test', 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  })

describe('POST /api/loja/track', () => {
  beforeEach(() => {
    vi.stubEnv('CRM_ACCOUNT_ID', ACC)
    vi.stubEnv('NEXT_PUBLIC_STORE_ACCOUNT_IDS', ACC)
    __resetRateLimitForTests()
    mocks.db = fakeDb({ store_events: [] })
  })

  it('stores events for the deploy account', async () => {
    const res = await POST(send())
    expect(res.status).toBe(204)
    expect((mocks.db as ReturnType<typeof fakeDb>).tables.store_events[0]).toMatchObject({ account_id: ACC, type: 'page_view' })
  })

  it('rejects an invalid payload', async () => {
    expect((await POST(send('9.9.9.9', { events: [{ type: 'purchase' }] }))).status).toBe(400)
  })

  it('rate limits one IP after 120 calls a minute', async () => {
    for (let i = 0; i < 120; i++) expect((await POST(send('5.5.5.5'))).status).toBe(204)
    expect((await POST(send('5.5.5.5'))).status).toBe(429)
    expect((await POST(send('6.6.6.6'))).status).toBe(204)
  })
})
