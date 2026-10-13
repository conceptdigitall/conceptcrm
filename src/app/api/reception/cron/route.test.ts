import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const drain = vi.fn()
const health = vi.fn()
const watchdog = vi.fn()
vi.mock('@/lib/reception/jobs', () => ({
  drainReceptionJobs: (...a: unknown[]) => drain(...a),
  checkEvolutionHealth: (...a: unknown[]) => health(...a),
  alertStuckHotLeads: (...a: unknown[]) => watchdog(...a),
}))
vi.mock('@/lib/reception/ops', () => ({ notifyOps: vi.fn() }))
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: [{ account_id: 'a1' }, { account_id: 'a2' }], error: null }) }),
    }),
  }),
}))

import { GET } from './route'

const req = (secret?: string) =>
  new Request('http://x/api/reception/cron', { headers: secret ? { 'x-cron-secret': secret } : {} })

beforeEach(() => {
  drain.mockResolvedValue({ done: 1, failed: 0 })
  health.mockResolvedValue('open')
  watchdog.mockResolvedValue(0)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('GET /api/reception/cron', () => {
  it('503 when the secret is not configured', async () => {
    vi.stubEnv('AUTOMATION_CRON_SECRET', '')
    expect((await GET(req('x'))).status).toBe(503)
  })

  it('401 without or with a wrong header', async () => {
    vi.stubEnv('AUTOMATION_CRON_SECRET', 'segredo')
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('errado!'))).status).toBe(401)
    expect(drain).not.toHaveBeenCalled()
  })

  it('runs per scoped account and returns counters', async () => {
    vi.stubEnv('AUTOMATION_CRON_SECRET', 'segredo')
    vi.stubEnv('CRM_ACCOUNT_ID', 'acc-1')
    const res = await GET(req('segredo'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ done: 1, failed: 0, errors: 0, health: { 'acc-1': 'open' } })
    expect(drain.mock.calls[0][2]).toMatchObject({ accountId: 'acc-1' })
    expect(watchdog).toHaveBeenCalledTimes(1)
    expect(watchdog.mock.calls[0][2]).toMatchObject({ accountId: 'acc-1' })
  })

  it('iterates enabled settings rows when there is no scope', async () => {
    vi.stubEnv('AUTOMATION_CRON_SECRET', 'segredo')
    vi.stubEnv('CRM_ACCOUNT_ID', '')
    const res = await GET(req('segredo'))
    expect((await res.json()).done).toBe(2)
    expect(health).toHaveBeenCalledTimes(2)
  })

  it('isolates a throwing account: the next one still drains', async () => {
    vi.stubEnv('AUTOMATION_CRON_SECRET', 'segredo')
    vi.stubEnv('CRM_ACCOUNT_ID', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    drain.mockRejectedValueOnce(new Error('boom 5513999991234')).mockResolvedValueOnce({ done: 3, failed: 1 })
    const res = await GET(req('segredo'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ done: 3, failed: 1, errors: 1 })
    expect(drain).toHaveBeenCalledTimes(2)
  })
})
