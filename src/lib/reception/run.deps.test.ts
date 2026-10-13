import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// buildReceptionDeps: o Haiku do classificador e o do texto usam um cliente Anthropic
// com timeout curto e 1 retry, para caber nos 60 s do webhook.

const h = vi.hoisted(() => ({ ctorOpts: [] as unknown[], create: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.create }
    constructor(opts: unknown) {
      h.ctorOpts.push(opts)
    }
  },
}))

const { buildReceptionDeps } = await import('./run')

afterEach(() => {
  vi.unstubAllEnvs()
  h.ctorOpts.length = 0
  h.create.mockReset()
})

describe('buildReceptionDeps', () => {
  it('classificador (Haiku) e phrase usam cliente com timeout 8000 e maxRetries 1', async () => {
    vi.stubEnv('LAYA_URL', '')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    h.create.mockResolvedValue({ content: [{ type: 'text', text: 'sim' }] })

    const deps = buildReceptionDeps({} as SupabaseClient, 'acc-1', new Date(), async () => ({}))
    const answer = await deps.classify('quero falar com alguém', { type: 'noul', instructions: 'Pede humano?' }, ['sim', 'não'])

    expect(answer).toBe('sim')
    expect(h.ctorOpts.length).toBeGreaterThan(0)
    for (const opts of h.ctorOpts) expect(opts).toMatchObject({ timeout: 8000, maxRetries: 1 })
  })
})
