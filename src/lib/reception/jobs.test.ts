import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { COPY } from './compose'
import { alertStuckHotLeads, checkEvolutionHealth, drainReceptionJobs, formatHora } from './jobs'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

function memoryDb(seed: Record<string, Row[]>, failOn?: (table: string, op: string, payload: any) => boolean) {
  const tables = new Map<string, Row[]>(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]))
  let seq = 0
  const t = (n: string) => {
    if (!tables.has(n)) tables.set(n, [])
    return tables.get(n)!
  }
  function from(name: string) {
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: any
    const filters: ((r: Row) => boolean)[] = []
    let ord: { k: string; asc: boolean } | null = null
    let lim = Infinity
    const exec = (): any => {
      if (failOn?.(name, op, payload)) return { data: null, error: { message: 'db down' } }
      if (op === 'insert') {
        const row = { id: `${name}-${++seq}`, ...payload }
        t(name).push(row)
        return { data: [row], error: null }
      }
      let hit = t(name).filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        hit.forEach((r) => Object.assign(r, payload))
        return { data: hit, error: null }
      }
      if (ord) hit = [...hit].sort((a, b) => (a[ord!.k] < b[ord!.k] ? -1 : 1) * (ord!.asc ? 1 : -1))
      return { data: hit.slice(0, lim), error: null }
    }
    const b: any = {
      select: () => b,
      insert: (p: any) => ((op = 'insert'), (payload = p), b),
      update: (p: any) => ((op = 'update'), (payload = p), b),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      lt: (k: string, v: any) => (filters.push((r) => r[k] < v), b),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
      lte: (k: string, v: any) => (filters.push((r) => r[k] <= v), b),
      order: (k: string, o?: { ascending?: boolean }) => ((ord = { k, asc: o?.ascending !== false }), b),
      limit: (n: number) => ((lim = n), b),
      maybeSingle: async () => ({ data: exec().data[0] ?? null, error: null }),
      then: (ok: any, ko: any) => Promise.resolve(exec()).then(ok, ko),
    }
    return b
  }
  return { db: { from } as unknown as SupabaseClient, t }
}

const NOW = new Date('2026-10-13T12:00:00Z')
const past = '2026-10-13T11:00:00Z'

const baseSeed = (over: Record<string, Row[]> = {}) => ({
  contacts: [{ id: 'c1', name: 'Maria Silva', phone: '5513999991234', user_id: 'u1' }],
  reception_sessions: [
    { id: 's1', account_id: 'a1', contact_id: 'c1', conversation_id: 'v1', stage: 'concluida', outcome: 'morno', appointment_id: null },
  ],
  appointments: [{ id: 'ap1', status: 'confirmed', scheduled_at: '2026-10-13T13:30:00Z', meeting_url: 'https://meet/x', contact_id: 'c1' }],
  reception_jobs: [] as Row[],
  messages: [] as Row[],
  contact_notes: [] as Row[],
  ...over,
})

const mkDeps = () => ({ send: vi.fn().mockResolvedValue({}), notify: vi.fn().mockResolvedValue(undefined) })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('formatHora', () => {
  it('formats in Sao Paulo time', () => {
    expect(formatHora('2026-10-13T13:00:00Z')).toBe('10h')
    expect(formatHora('2026-10-13T13:30:00Z')).toBe('10h30')
  })
})

describe('drainReceptionJobs', () => {
  it('sends a reminder for a confirmed appointment and records the bot message', async () => {
    const { db, t } = memoryDb(
      baseSeed({
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'lembrete', run_at: past, status: 'pending', attempts: 0, appointment_id: 'ap1' }],
        reception_sessions: [{ id: 's1', account_id: 'a1', contact_id: 'c1', conversation_id: 'v1', stage: 'concluida', outcome: 'quente', appointment_id: 'ap1' }],
      }),
    )
    const deps = mkDeps()
    const r = await drainReceptionJobs(db, NOW, deps)
    expect(r).toEqual({ done: 1, failed: 0 })
    expect(deps.send).toHaveBeenCalledWith(
      '5513999991234',
      'Oi, Maria! Passando pra lembrar da nossa call hoje às 10h30. Link: https://meet/x',
    )
    expect(t('messages')[0]).toMatchObject({ sender_type: 'bot', content_type: 'text', status: 'sent', conversation_id: 'v1' })
    expect(t('reception_jobs')[0].status).toBe('done')
  })

  it('collapses the greeting when the name is Novo Lead', async () => {
    const { db } = memoryDb(
      baseSeed({
        contacts: [{ id: 'c1', name: 'Novo Lead', phone: '5513999991234', user_id: 'u1' }],
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'lembrete', run_at: past, status: 'pending', attempts: 0, appointment_id: 'ap1' }],
      }),
    )
    const deps = mkDeps()
    await drainReceptionJobs(db, NOW, deps)
    expect(deps.send.mock.calls[0][1]).toMatch(/^Oi! Passando/)
  })

  it('skips the reminder of a cancelled appointment and marks done', async () => {
    const { db, t } = memoryDb(
      baseSeed({
        appointments: [{ id: 'ap1', status: 'cancelled', scheduled_at: '2026-10-13T13:00:00Z', meeting_url: 'x', contact_id: 'c1' }],
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'lembrete', run_at: past, status: 'pending', attempts: 0, appointment_id: 'ap1' }],
      }),
    )
    const deps = mkDeps()
    const r = await drainReceptionJobs(db, NOW, deps)
    expect(deps.send).not.toHaveBeenCalled()
    expect(r).toEqual({ done: 1, failed: 0 })
    expect(t('reception_jobs')[0].status).toBe('done')
  })

  it('follow-up outside the 24h window: note + notify, no send, job done', async () => {
    const { db, t } = memoryDb(
      baseSeed({
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'followup', run_at: past, status: 'pending', attempts: 0, session_id: 's1' }],
        messages: [{ id: 'm1', conversation_id: 'v1', sender_type: 'customer', created_at: '2026-10-10T12:00:00Z' }],
      }),
    )
    const deps = mkDeps()
    const r = await drainReceptionJobs(db, NOW, deps)
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.notify).toHaveBeenCalledTimes(1)
    expect(t('contact_notes')[0]).toMatchObject({
      account_id: 'a1',
      contact_id: 'c1',
      user_id: 'u1',
      note_text: 'Follow-up de morno pendente: chamar pelo WhatsApp oficial ou e-mail',
    })
    expect(r).toEqual({ done: 1, failed: 0 })
    expect(t('reception_jobs')[0].status).toBe('done')
  })

  it('follow-up with a customer message 2h ago sends COPY.followup', async () => {
    const { db, t } = memoryDb(
      baseSeed({
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'followup', run_at: past, status: 'pending', attempts: 0, session_id: 's1' }],
        messages: [{ id: 'm1', conversation_id: 'v1', sender_type: 'customer', created_at: '2026-10-13T10:00:00Z' }],
      }),
    )
    const deps = mkDeps()
    await drainReceptionJobs(db, NOW, deps)
    expect(deps.send).toHaveBeenCalledWith('5513999991234', COPY.followup.replace('{firstName}', 'Maria'))
    expect(t('messages').filter((m) => m.sender_type === 'bot')).toHaveLength(1)
  })

  it('follow-up is skipped when the session already has an appointment', async () => {
    const { db } = memoryDb(
      baseSeed({
        reception_sessions: [{ id: 's1', account_id: 'a1', contact_id: 'c1', conversation_id: 'v1', stage: 'concluida', outcome: 'morno', appointment_id: 'ap1' }],
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'followup', run_at: past, status: 'pending', attempts: 0, session_id: 's1' }],
        messages: [{ id: 'm1', conversation_id: 'v1', sender_type: 'customer', created_at: '2026-10-13T10:00:00Z' }],
      }),
    )
    const deps = mkDeps()
    await drainReceptionJobs(db, NOW, deps)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('retries twice (+5 min) and notifies once on the 3rd failure', async () => {
    const { db, t } = memoryDb(
      baseSeed({
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'lembrete', run_at: past, status: 'pending', attempts: 0, appointment_id: 'ap1' }],
      }),
    )
    const deps = mkDeps()
    deps.send.mockRejectedValue(new Error('boom 5513999991234'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    let r = await drainReceptionJobs(db, NOW, deps)
    expect(r).toEqual({ done: 0, failed: 0 })
    expect(t('reception_jobs')[0]).toMatchObject({ status: 'pending', attempts: 1 })
    expect(t('reception_jobs')[0].run_at).toBe(new Date(new Date(past).getTime() + 5 * 60000).toISOString())

    const later = new Date(NOW.getTime() + 10 * 60000)
    r = await drainReceptionJobs(db, later, deps)
    expect(t('reception_jobs')[0]).toMatchObject({ status: 'pending', attempts: 2 })
    expect(deps.notify).not.toHaveBeenCalled()

    r = await drainReceptionJobs(db, new Date(later.getTime() + 10 * 60000), deps)
    expect(r).toEqual({ done: 0, failed: 1 })
    expect(t('reception_jobs')[0]).toMatchObject({ status: 'failed', attempts: 3 })
    expect(deps.notify).toHaveBeenCalledTimes(1)
    expect(deps.notify.mock.calls[0][0]).not.toContain('5513999991234')
  })

  it('does not run jobs already claimed or not yet due', async () => {
    const { db } = memoryDb(
      baseSeed({
        reception_jobs: [
          { id: 'j1', account_id: 'a1', kind: 'lembrete', run_at: past, status: 'running', attempts: 0, appointment_id: 'ap1' },
          { id: 'j2', account_id: 'a1', kind: 'lembrete', run_at: '2026-10-14T00:00:00Z', status: 'pending', attempts: 0, appointment_id: 'ap1' },
        ],
      }),
    )
    const deps = mkDeps()
    expect(await drainReceptionJobs(db, NOW, deps)).toEqual({ done: 0, failed: 0 })
    expect(deps.send).not.toHaveBeenCalled()
  })
})

describe('hardening', () => {
  it('post-send DB failure does not resend; job ends done', async () => {
    const { db, t } = memoryDb(
      baseSeed({
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'followup', run_at: past, status: 'pending', attempts: 0, session_id: 's1' }],
        messages: [{ id: 'm1', conversation_id: 'v1', sender_type: 'customer', created_at: '2026-10-13T10:00:00Z' }],
      }),
      (table, op) => table === 'messages' && op === 'insert',
    )
    const deps = mkDeps()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await drainReceptionJobs(db, NOW, deps)
    expect(deps.send).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ done: 1, failed: 0 })
    expect(t('reception_jobs')[0].status).toBe('done')
    expect(deps.notify).toHaveBeenCalledTimes(1)
  })

  it('session lookup failing before send prevents the send', async () => {
    const { db } = memoryDb(
      baseSeed({
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'lembrete', run_at: past, status: 'pending', attempts: 0, appointment_id: 'ap1' }],
      }),
      (table) => table === 'reception_sessions',
    )
    const deps = mkDeps()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await drainReceptionJobs(db, NOW, deps)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('sweeps jobs stuck in running > 30 min to failed, once, without sending', async () => {
    const { db, t } = memoryDb(
      baseSeed({
        reception_jobs: [
          { id: 'jstuck-1', account_id: 'a1', kind: 'lembrete', run_at: '2026-10-13T11:00:00Z', status: 'running', attempts: 0, appointment_id: 'ap1' },
          { id: 'jfresh-2', account_id: 'a1', kind: 'lembrete', run_at: '2026-10-13T11:50:00Z', status: 'running', attempts: 0, appointment_id: 'ap1' },
        ],
      }),
    )
    const deps = mkDeps()
    await drainReceptionJobs(db, NOW, deps)
    expect(t('reception_jobs').find((j) => j.id === 'jstuck-1')!.status).toBe('failed')
    expect(t('reception_jobs').find((j) => j.id === 'jfresh-2')!.status).toBe('running')
    expect(deps.notify).toHaveBeenCalledTimes(1)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('notifies when the done update fails', async () => {
    const { db } = memoryDb(
      baseSeed({
        appointments: [{ id: 'ap1', status: 'cancelled', scheduled_at: past, meeting_url: 'x', contact_id: 'c1' }],
        reception_jobs: [{ id: 'j1', account_id: 'a1', kind: 'lembrete', run_at: past, status: 'pending', attempts: 0, appointment_id: 'ap1' }],
      }),
      (table, op, p) => table === 'reception_jobs' && op === 'update' && p?.status === 'done',
    )
    const deps = mkDeps()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await drainReceptionJobs(db, NOW, deps)
    expect(r.done).toBe(0)
    expect(deps.notify).toHaveBeenCalledTimes(1)
  })
})

describe('checkEvolutionHealth', () => {
  const closed = () => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ instance: { state: 'close' } }) })

  it('returns open without notifying', async () => {
    const { db } = memoryDb({ reception_settings: [{ account_id: 'a1', last_health_alert_at: null }] })
    const notify = vi.fn()
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ instance: { state: 'open' } }) })
    expect(await checkEvolutionHealth(db, 'a1', NOW, { fetchImpl: f as any, notify })).toBe('open')
    expect(notify).not.toHaveBeenCalled()
  })

  it('notifies only once when down twice within 10 minutes', async () => {
    const { db, t } = memoryDb({ reception_settings: [{ account_id: 'a1', last_health_alert_at: null }] })
    const notify = vi.fn().mockResolvedValue(undefined)
    expect(await checkEvolutionHealth(db, 'a1', NOW, { fetchImpl: closed() as any, notify })).toBe('down')
    await checkEvolutionHealth(db, 'a1', new Date(NOW.getTime() + 10 * 60000), { fetchImpl: closed() as any, notify })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(t('reception_settings')[0].last_health_alert_at).toBe(NOW.toISOString())
  })

  it('alerts again after more than 1h and treats fetch errors as down', async () => {
    const { db } = memoryDb({ reception_settings: [{ account_id: 'a1', last_health_alert_at: NOW.toISOString() }] })
    const notify = vi.fn().mockResolvedValue(undefined)
    const f = vi.fn().mockRejectedValue(new Error('net'))
    const r = await checkEvolutionHealth(db, 'a1', new Date(NOW.getTime() + 61 * 60000), { fetchImpl: f as any, notify })
    expect(r).toBe('down')
    expect(notify).toHaveBeenCalledTimes(1)
  })
})

describe('alertStuckHotLeads (watchdog)', () => {
  const old = '2026-10-13T11:40:00Z' // 20 min antes de NOW
  const recent = '2026-10-13T11:55:00Z' // 5 min antes
  const hot = (over: Row = {}) => ({
    id: 's1', account_id: 'a1', contact_id: 'c1', conversation_id: 'v1',
    stage: 'concluida', outcome: 'quente', appointment_id: null, alerted_at: null, updated_at: old, ...over,
  })

  it('avisa uma vez o lead quente preso em concluida sem reunião há mais de 10 min e grava alerted_at', async () => {
    const { db, t } = memoryDb({ reception_sessions: [hot()] })
    const notify = vi.fn().mockResolvedValue(undefined)
    expect(await alertStuckHotLeads(db, NOW, { notify })).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatch(/sem reunião/)
    expect(t('reception_sessions')[0].alerted_at).toBe(NOW.toISOString())

    expect(await alertStuckHotLeads(db, NOW, { notify })).toBe(0)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('ignora sessão recente, com reunião, já avisada, morna ou de outra conta', async () => {
    const { db } = memoryDb({
      reception_sessions: [
        hot({ id: 'r', updated_at: recent }),
        hot({ id: 'ap', appointment_id: 'ap1' }),
        hot({ id: 'al', alerted_at: old }),
        hot({ id: 'mo', outcome: 'morno' }),
        hot({ id: 'ag', stage: 'agendando' }),
        hot({ id: 'ot', account_id: 'a2' }),
      ],
    })
    const notify = vi.fn().mockResolvedValue(undefined)
    expect(await alertStuckHotLeads(db, NOW, { notify, accountId: 'a1' })).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })
})
