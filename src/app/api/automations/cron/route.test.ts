import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Banco dividido entre lojas: a fila de automações de uma conta sai pelo
// WhatsApp do deploy que a processa, então cada deploy só drena a própria.

const ACCOUNT = '0d7c1a52-6f7e-4f43-9a7e-2f2a8f0c1b11'

const eqCalls: unknown[][] = []
const fromCalls: string[] = []

function builder() {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'lte', 'order', 'limit', 'update']) b[op] = () => b
  b.eq = (...args: unknown[]) => {
    eqCalls.push(args)
    return b
  }
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
  return b
}

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      fromCalls.push(table)
      return builder()
    },
  }),
}))
vi.mock('@/lib/automations/engine', () => ({ resumePendingExecution: vi.fn() }))

const { GET } = await import('./route')

const request = () =>
  new Request('http://localhost/api/automations/cron', { headers: { 'x-cron-secret': 'cron-secret' } })

describe('GET /api/automations/cron: conta deste deploy', () => {
  const originalEnv = process.env

  beforeEach(() => {
    eqCalls.length = 0
    fromCalls.length = 0
    process.env = { ...originalEnv, AUTOMATION_CRON_SECRET: 'cron-secret' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('com CRM_ACCOUNT_ID, só pega a fila dessa conta', async () => {
    process.env.CRM_ACCOUNT_ID = ACCOUNT

    const res = await GET(request())

    expect(res.status).toBe(200)
    expect(eqCalls).toContainEqual(['account_id', ACCOUNT])
  })

  it('sem CRM_ACCOUNT_ID, segue o modo antigo (fila de todas as contas)', async () => {
    delete process.env.CRM_ACCOUNT_ID

    const res = await GET(request())

    expect(res.status).toBe(200)
    expect(fromCalls).toEqual(['automation_pending_executions'])
    expect(eqCalls.some(([col]) => col === 'account_id')).toBe(false)
  })
})
