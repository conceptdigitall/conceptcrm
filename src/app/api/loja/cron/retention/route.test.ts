import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/store/admin-client', () => ({ supabaseAdmin: () => ({ rpc: mocks.rpc }) }))

import { GET } from './route'

describe('GET /api/loja/cron/retention', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron_123')
    mocks.rpc.mockReset().mockResolvedValue({ data: 42, error: null })
  })

  it('refuses without the cron secret', async () => {
    expect((await GET(new Request('http://crm.test/x'))).status).toBe(401)
    expect((await GET(new Request('http://crm.test/x', { headers: { Authorization: 'Bearer nope' } }))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses when no secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(new Request('http://crm.test/x', { headers: { Authorization: 'Bearer ' } }))).status).toBe(401)
  })

  it('purges old events', async () => {
    const res = await GET(new Request('http://crm.test/x', { headers: { Authorization: 'Bearer cron_123' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 42 })
    expect(mocks.rpc).toHaveBeenCalledWith('store_purge_old_events')
  })
})
