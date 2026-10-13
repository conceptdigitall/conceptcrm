import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { addNote, ensureDeal, moveDeal, pauseAi, tagContact } from './crm'
import { createSession, enqueueJob, loadSession, loadSettings, saveSession } from './store'
import type { ReceptionSession, ReceptionSettings } from './types'

type Call = { table: string; op: string; payload?: unknown; opts?: unknown; filters: [string, unknown][] }
type Result = { data?: unknown; error?: unknown }

/** Scripted fake: `results[table:op]` is the terminal result; every call is recorded. */
function fakeDb(results: Record<string, Result> = {}) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      calls.push(call)
      const resolve = () => {
        const r = results[`${table}:${call.op}`] ?? {}
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null })
      }
      const b: Record<string, unknown> = {}
      const chain = () => b
      b.select = (...a: unknown[]) => {
        if (call.op === 'select' || a.length) call.op = call.op === 'select' ? 'select' : call.op
        return b
      }
      b.insert = (p: unknown) => ((call.op = 'insert'), (call.payload = p), b)
      b.update = (p: unknown) => ((call.op = 'update'), (call.payload = p), b)
      b.upsert = (p: unknown, o: unknown) => ((call.op = 'upsert'), (call.payload = p), (call.opts = o), b)
      b.eq = (k: string, v: unknown) => (call.filters.push([k, v]), b)
      b.order = chain
      b.limit = chain
      b.maybeSingle = resolve
      b.single = resolve
      b.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => resolve().then(f, r)
      return b
    },
  } as unknown as SupabaseClient
  return { db, calls }
}

const settings: ReceptionSettings = {
  accountId: 'acc',
  enabled: true,
  pipelineId: 'pipe',
  stageIds: { novo: 's-novo', agendado: 's-ag', morno: 's-mo', curioso: 's-cu', humano: 's-hu' },
  plansUrl: 'https://x.com/planos',
  lastHealthAlertAt: null,
}

describe('ensureDeal', () => {
  it('reuses the active deal without inserting', async () => {
    const { db, calls } = fakeDb({ 'deals:select': { data: { id: 'deal-1' } } })
    const id = await ensureDeal(db, {
      accountId: 'acc', userId: 'u', contactId: 'c', conversationId: 'cv', settings, title: 'T',
    })
    expect(id).toBe('deal-1')
    const sel = calls.find((c) => c.table === 'deals' && c.op === 'select')!
    expect(sel.filters).toEqual(expect.arrayContaining([['account_id', 'acc'], ['contact_id', 'c'], ['pipeline_id', 'pipe'], ['status', 'active']]))
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('creates in stage novo when none exists', async () => {
    const { db, calls } = fakeDb({ 'deals:insert': { data: { id: 'deal-2' } } })
    const id = await ensureDeal(db, {
      accountId: 'acc', userId: 'u', contactId: 'c', conversationId: 'cv', settings, title: 'T',
    })
    expect(id).toBe('deal-2')
    const ins = calls.find((c) => c.op === 'insert')!
    expect(ins.payload).toMatchObject({
      stage_id: 's-novo', pipeline_id: 'pipe', currency: 'BRL', value: 0, status: 'active',
    })
  })
})

describe('ensureDeal lookup error', () => {
  it('throws instead of creating a duplicate', async () => {
    const { db, calls } = fakeDb({ 'deals:select': { error: { message: 'boom' } } })
    await expect(
      ensureDeal(db, { accountId: 'acc', userId: 'u', contactId: 'c', conversationId: 'cv', settings, title: 'T' }),
    ).rejects.toThrow(/boom/)
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })
})

describe('moveDeal / pauseAi / addNote', () => {
  it('moveDeal updates stage_id', async () => {
    const { db, calls } = fakeDb()
    await moveDeal(db, 'd', 's-ag')
    expect(calls[0]).toMatchObject({ table: 'deals', op: 'update' })
    expect(calls[0].payload).toMatchObject({ stage_id: 's-ag' })
  })
  it('pauseAi sets flag and summary', async () => {
    const { db, calls } = fakeDb()
    await pauseAi(db, 'cv', 'resumo')
    expect(calls[0].table).toBe('conversations')
    expect(calls[0].payload).toEqual({ ai_autoreply_disabled: true, ai_handoff_summary: 'resumo' })
  })
  it('addNote inserts contact note', async () => {
    const { db, calls } = fakeDb()
    await addNote(db, { accountId: 'acc', contactId: 'c', userId: 'u', text: 'oi' })
    expect(calls[0].payload).toEqual({ account_id: 'acc', contact_id: 'c', user_id: 'u', note_text: 'oi' })
  })
})

describe('tagContact', () => {
  it('creates the curioso tag when missing, then upserts the link', async () => {
    const { db, calls } = fakeDb({
      'tags:select': { data: null },
      'tags:insert': { data: { id: 'tag-9' } },
    })
    await tagContact(db, { accountId: 'acc', userId: 'u', contactId: 'c', tagName: 'curioso' })
    const ins = calls.find((c) => c.table === 'tags' && c.op === 'insert')!
    expect(ins.payload).toMatchObject({ account_id: 'acc', user_id: 'u', name: 'curioso' })
    const up = calls.find((c) => c.table === 'contact_tags')!
    expect(up.op).toBe('upsert')
    expect(up.payload).toEqual({ contact_id: 'c', tag_id: 'tag-9' })
    expect(up.opts).toMatchObject({ onConflict: 'contact_id,tag_id' })
  })

  it('reuses an existing tag', async () => {
    const { db, calls } = fakeDb({ 'tags:select': { data: { id: 'tag-1' } } })
    await tagContact(db, { accountId: 'acc', userId: 'u', contactId: 'c', tagName: 'curioso' })
    expect(calls.some((c) => c.table === 'tags' && c.op === 'insert')).toBe(false)
  })
})

describe('store', () => {
  const row = {
    id: 's1', account_id: 'acc', contact_id: 'c', conversation_id: 'cv', deal_id: null,
    stage: 'nicho', answers: {}, unclear_count: 0, outcome: null, score: null, origin: 'direto',
    offered_slots: [], slot_rounds: 0, appointment_id: null,
  }
  const session: ReceptionSession = {
    id: 's1', accountId: 'acc', contactId: 'c', conversationId: 'cv', dealId: null,
    stage: 'interesse', answers: { nicho: 'x' }, unclearCount: 0, outcome: null, score: null,
    origin: 'direto', offeredSlots: [], slotRounds: 0, appointmentId: null,
  }

  it('saveSession returns false when 0 rows updated, conditional on prevStage', async () => {
    const { db, calls } = fakeDb({ 'reception_sessions:update': { data: [] } })
    expect(await saveSession(db, session, 'nicho')).toBe(false)
    expect(calls[0].filters).toContainEqual(['stage', 'nicho'])
    expect(calls[0].filters).toContainEqual(['id', 's1'])
    expect(calls[0].payload).toMatchObject({ stage: 'interesse', updated_at: expect.any(String) })
  })

  it('saveSession returns true when a row changed', async () => {
    const { db } = fakeDb({ 'reception_sessions:update': { data: [{ id: 's1' }] } })
    expect(await saveSession(db, session, 'nicho')).toBe(true)
  })

  it('createSession starts at nicho and maps to camelCase', async () => {
    const { db, calls } = fakeDb({ 'reception_sessions:insert': { data: row } })
    const s = await createSession(db, {
      accountId: 'acc', contactId: 'c', conversationId: 'cv', dealId: null, origin: 'direto',
    })
    expect(calls[0].payload).toMatchObject({ stage: 'nicho', conversation_id: 'cv' })
    expect(s.conversationId).toBe('cv')
    expect(s.stage).toBe('nicho')
  })

  it('loadSession throws on db error', async () => {
    const { db } = fakeDb({ 'reception_sessions:select': { error: { message: 'down' } } })
    await expect(loadSession(db, 'cv')).rejects.toThrow(/down/)
  })

  it('loadSession returns null when missing', async () => {
    const { db } = fakeDb()
    expect(await loadSession(db, 'cv')).toBeNull()
  })

  it('enqueueJob inserts snake_case', async () => {
    const { db, calls } = fakeDb()
    await enqueueJob(db, { accountId: 'acc', kind: 'lembrete', runAt: new Date('2026-01-01T00:00:00Z'), appointmentId: 'a' })
    expect(calls[0].payload).toMatchObject({
      account_id: 'acc', kind: 'lembrete', run_at: '2026-01-01T00:00:00.000Z', appointment_id: 'a',
    })
  })

  describe('loadSettings', () => {
    const full = {
      account_id: 'acc', enabled: true, pipeline_id: 'pipe',
      stage_ids: settings.stageIds, plans_url: 'https://x.com/planos', last_health_alert_at: null,
    }
    it('throws on db error', async () => {
      const { db } = fakeDb({ 'reception_settings:select': { error: { message: 'down' } } })
      await expect(loadSettings(db, 'acc')).rejects.toThrow(/down/)
    })
    it('returns null when the row is missing', async () => {
      const { db } = fakeDb()
      expect(await loadSettings(db, 'acc')).toBeNull()
    })
    it('maps a fully configured row', async () => {
      const { db } = fakeDb({ 'reception_settings:select': { data: full } })
      expect(await loadSettings(db, 'acc')).toEqual(settings)
    })
    it.each([
      ['pipeline_id null', { ...full, pipeline_id: null }],
      ['stage missing', { ...full, stage_ids: { ...settings.stageIds, humano: undefined } }],
      ['plans_url empty', { ...full, plans_url: '' }],
    ])('returns null and warns when not configured (%s)', async (_n, data) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { db } = fakeDb({ 'reception_settings:select': { data } })
      expect(await loadSettings(db, 'acc')).toBeNull()
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })
})
