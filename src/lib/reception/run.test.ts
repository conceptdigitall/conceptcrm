import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AvailableSlot } from '@/lib/calendar/rules'
import type { LayaQuestion } from '@/lib/prospecting/columns'

import { COPY, formatOffer } from './compose'
import { runReception, shouldStartReception, type ReceptionDeps, type ReceptionInput } from './run'
import type { ReceptionSettings } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- in-memory Supabase (Map per table, only the methods the reception uses) ----------
type Row = Record<string, any>

function memoryDb() {
  const tables = new Map<string, Map<string, Row>>()
  let seq = 0
  const calls: { table: string; op: string; payload: any }[] = []
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name)!
  }

  function from(name: string) {
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    let payload: any = null
    const filters: [string, unknown, boolean][] = []
    const matches = (r: Row) => filters.every(([k, v, neg]) => (neg ? r[k] !== v : r[k] === v))

    const exec = (): { data: any; error: any } => {
      if (op !== 'select') calls.push({ table: name, op, payload })
      const t = table(name)
      if (op === 'insert') {
        const rows: Row[] = (Array.isArray(payload) ? payload : [payload]).map((p: Row) => ({ id: `${name}-${++seq}`, ...p }))
        for (const r of rows) {
          if (name === 'reception_sessions' && [...t.values()].some((x) => x.conversation_id === r.conversation_id)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
          }
        }
        rows.forEach((r: Row) => t.set(r.id, r))
        return { data: rows, error: null }
      }
      if (op === 'upsert') {
        const r = { id: `${name}-${++seq}`, ...payload }
        t.set(r.id, r)
        return { data: [r], error: null }
      }
      const hit = [...t.values()].filter(matches)
      if (op === 'update') {
        hit.forEach((r) => Object.assign(r, payload))
        return { data: hit, error: null }
      }
      return { data: hit, error: null }
    }

    const b: any = {
      select: () => b,
      insert: (p: any) => ((op = 'insert'), (payload = p), b),
      update: (p: any) => ((op = 'update'), (payload = p), b),
      upsert: (p: any) => ((op = 'upsert'), (payload = p), b),
      eq: (k: string, v: unknown) => (filters.push([k, v, false]), b),
      neq: (k: string, v: unknown) => (filters.push([k, v, true]), b),
      order: () => b,
      limit: () => b,
      single: async () => {
        const r = exec()
        return r.error ? r : { data: r.data[0] ?? null, error: r.data[0] ? null : { message: 'no rows' } }
      },
      maybeSingle: async () => {
        const r = exec()
        return r.error ? r : { data: r.data[0] ?? null, error: null }
      },
      then: (ok: any, ko: any) => Promise.resolve(exec()).then(ok, ko),
    }
    return b
  }

  return { db: { from } as unknown as SupabaseClient, table, calls }
}

// ---------- fakes ----------
const NOW = new Date('2026-10-13T08:00:00-03:00') // terça

function slot(dateStr: string, time: string): AvailableSlot {
  const dateObj = new Date(`${dateStr}T${time}:00-03:00`)
  return { time, iso: dateObj.toISOString(), dateObj }
}

const DAYS: Record<string, string[]> = {
  '2026-10-13': ['10:00', '11:00'],
  '2026-10-14': ['09:00', '14:00'],
  '2026-10-15': ['09:00'],
}
const loadDay = async (d: string) => (DAYS[d] ?? []).map((t) => slot(d, t))

/** Keyword-driven classifier standing in for Laya/Haiku. */
async function fakeClassify(text: string, q: LayaQuestion, options: string[]): Promise<string> {
  const t = text.toLowerCase()
  const i = q.instructions
  const yes = (b: boolean) => (b ? 'sim' : 'não')
  if (i.includes('falar com uma pessoa')) return yes(t.includes('humano') || t.includes('pessoa'))
  if (i.includes('marketing com IA')) return yes(t.includes('marketing'))
  if (i.includes('tráfego pago')) return yes(t.includes('tráfego'))
  if (i.includes('recepcionista ou atendimento')) return yes(t.includes('recepcionista'))
  if (i.includes('CRM')) return yes(t.includes('crm'))
  if (i.includes('loja virtual')) return yes(t.includes('site'))
  if (i.includes('fatura/vende')) return t.includes('não faturo') ? 'não' : t.includes('faturo') ? 'sim' : 'indefinido'
  if (i.includes('time cuidando')) return yes(t.includes('secretária'))
  if (i.includes('urgência')) return t.includes('agora') ? 'agora' : t.includes('pesquisando') ? 'pesquisando' : 'indefinido'
  if (i.includes('Qual horário')) return options.includes('nenhum') ? 'nenhum' : 'indefinido'
  return 'indefinido'
}

const SETTINGS: ReceptionSettings = {
  accountId: 'acc-1',
  enabled: true,
  pipelineId: 'pipe-1',
  stageIds: { novo: 'st-novo', agendado: 'st-agendado', morno: 'st-morno', curioso: 'st-curioso', humano: 'st-humano' },
  plansUrl: 'https://concept.digital/planos',
  lastHealthAlertAt: null,
}

function setup(over: Partial<ReceptionDeps> = {}) {
  const mem = memoryDb()
  const sendWhatsApp = vi.fn(async () => ({}))
  const schedule = vi.fn(async (p: any) => ({
    success: true,
    appointmentId: 'appt-1',
    meetUrl: 'https://meet.google.com/abc',
    calendarUrl: 'https://calendar.google.com/x',
    meetCreated: true,
    replyMessage: `Agendado ${p.datetimeIso}`,
  }))
  const deps: ReceptionDeps = {
    db: mem.db,
    classify: vi.fn(fakeClassify),
    phrase: vi.fn(async () => {
      throw new Error('haiku off')
    }),
    loadDay: vi.fn(loadDay),
    schedule: schedule as any,
    sendWhatsApp,
    ...over,
  }
  const say = (text: string) => {
    const input: ReceptionInput = {
      accountId: 'acc-1',
      userId: 'user-1',
      contactId: 'contact-1',
      conversationId: 'conv-1',
      senderName: 'Ana Souza',
      senderPhone: '5513988887777',
      text,
      settings: SETTINGS,
      now: NOW,
    }
    return runReception(input, deps)
  }
  const session = () => [...mem.table('reception_sessions').values()][0]
  const deal = () => [...mem.table('deals').values()][0]
  const jobs = () => [...mem.table('reception_jobs').values()]
  return { mem, deps, say, session, deal, jobs, sendWhatsApp, schedule }
}

const OPS = '5513911112222'

beforeEach(() => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
  vi.stubEnv('TELEGRAM_OPS_CHAT_ID', '')
  vi.stubEnv('ADMIN_WHATSAPP_NUMBERS', OPS)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function reachAgendando(t: ReturnType<typeof setup>) {
  await t.say('oi')
  await t.say('dentista')
  await t.say('tráfego e CRM')
  await t.say('sim, faturo e tenho secretária')
  return t.say('agora')
}

describe('runReception', () => {
  it('1ª mensagem "oi": cria deal e sessão em nicho e pergunta o nicho sem contar como não entendi', async () => {
    const t = setup()
    const reply = await t.say('oi #abc123')
    expect(reply).toBe(COPY.ask.nicho)
    expect(t.session()).toMatchObject({ stage: 'nicho', origin: 'abc123', deal_id: t.deal().id })
    expect(t.session().unclear_count ?? 0).toBe(0)
    expect(t.deal()).toMatchObject({ stage_id: 'st-novo', pipeline_id: 'pipe-1', contact_id: 'contact-1' })
  })

  it('1ª mensagem com conteúdo ("dentista") não conta como resposta', async () => {
    const t = setup()
    expect(await t.say('dentista')).toBe(COPY.ask.nicho)
    expect(t.session().stage).toBe('nicho')
    expect(t.session().answers).toBeUndefined()
  })

  it('caminho quente completo: oferta 3 horários e "2" agenda o 2º, cria lembrete 1h antes e move para agendado', async () => {
    const t = setup()
    const offer = await reachAgendando(t)
    const offered = t.session().offered_slots
    expect(offered).toHaveLength(3)
    expect(offer).toBe(formatOffer(offered))
    expect(t.session()).toMatchObject({ stage: 'agendando', outcome: 'quente', score: 100 })

    const reply = await t.say('2')
    const iso = slot('2026-10-14', '14:00').iso
    expect(offered[1].iso).toBe(iso)
    expect(t.schedule).toHaveBeenCalledTimes(1)
    expect(t.schedule.mock.calls[0][0]).toMatchObject({
      datetimeIso: iso,
      clientName: 'Ana Souza',
      senderPhone: '5513988887777',
      contactId: 'contact-1',
      accountId: 'acc-1',
      userId: 'user-1',
      conversationId: 'conv-1',
      dealId: t.deal().id,
      sendEvolutionMessage: t.sendWhatsApp,
    })
    expect(t.schedule.mock.calls[0][0].notes).toContain('dentista')
    expect(reply).toBe(`Agendado ${iso}`)
    expect(t.session()).toMatchObject({ stage: 'concluida', appointment_id: 'appt-1' })
    expect(t.deal().stage_id).toBe('st-agendado')
    const [job] = t.jobs()
    expect(t.jobs()).toHaveLength(1)
    expect(job).toMatchObject({ kind: 'lembrete', appointment_id: 'appt-1', session_id: t.session().id })
    expect(job.run_at).toBe(new Date(new Date(iso).getTime() - 3600_000).toISOString())
  })

  it('lead recusa os horários: nova oferta sem repetir os já oferecidos', async () => {
    const t = setup()
    await reachAgendando(t)
    const first = t.session().offered_slots.map((s: any) => s.iso)
    const reply = await t.say('pode ser quinta 15h?')
    const second = t.session().offered_slots.map((s: any) => s.iso)
    expect(second.length).toBeGreaterThan(0)
    expect(second.some((iso: string) => first.includes(iso))).toBe(false)
    expect(reply).toBe(formatOffer(t.session().offered_slots))
    expect(t.session().slot_rounds).toBe(1)
  })

  it('sem horários livres na 1ª oferta: calendarFail e handoff completo para o João', async () => {
    const t = setup({ loadDay: vi.fn(async () => []) })
    t.mem.table('conversations').set('conv-1', { id: 'conv-1' })
    const reply = await reachAgendando(t)
    expect(reply).toBe(COPY.calendarFail)
    expect(t.session()).toMatchObject({ stage: 'humano', outcome: 'humano' })
    const pauses = t.mem.calls.filter((c) => c.table === 'conversations' && c.op === 'update')
    expect(pauses).toHaveLength(1)
    expect(pauses[0].payload).toMatchObject({ ai_autoreply_disabled: true })
    expect(pauses[0].payload.ai_handoff_summary).toContain('dentista')
    const moves = t.mem.calls.filter((c) => c.table === 'deals' && c.op === 'update')
    expect(moves).toHaveLength(1)
    expect(moves[0].payload.stage_id).toBe('st-humano')
    expect(t.sendWhatsApp).toHaveBeenCalledTimes(1)
    expect(t.sendWhatsApp).toHaveBeenCalledWith(OPS, expect.stringContaining('***7777'))
    expect(t.sendWhatsApp.mock.calls.every((c: any[]) => !String(c[1]).includes('5513988887777'))).toBe(true)

    // stage humano → silent
    expect(await t.say('e aí, cadê os horários?')).toBeNull()
    expect(t.sendWhatsApp).toHaveBeenCalledTimes(1)
  })

  it('agenda falha na 2ª rodada (slot_none): calendarFail e handoff', async () => {
    let calls = 0
    const t = setup({
      loadDay: vi.fn(async (d: string) => {
        calls++
        if (calls > 5) throw new Error('google fora')
        return loadDay(d)
      }),
    })
    await reachAgendando(t)
    t.sendWhatsApp.mockClear()
    expect(await t.say('pode ser quinta 15h?')).toBe(COPY.calendarFail)
    expect(t.session()).toMatchObject({ stage: 'humano', outcome: 'humano' })
    expect(t.deal().stage_id).toBe('st-humano')
    expect(t.sendWhatsApp).toHaveBeenCalledTimes(1)
  })

  it('fallback em agendando sem horários oferecidos não manda oferta vazia', async () => {
    const t = setup()
    await t.say('oi')
    t.session().stage = 'agendando'
    t.session().offered_slots = []
    ;(t.deps.classify as any).mockImplementation(async () => {
      throw new Error('fora')
    })
    expect(await t.say('1')).toBe(COPY.calendarFail)
  })

  it.each([
    ['success:false', async () => ({ success: false, meetUrl: '', calendarUrl: '', meetCreated: false, replyMessage: '' })],
    ['lança erro', async () => { throw new Error('google fora') }],
  ])('agendamento falha (%s): volta para agendando, calendarFail e avisa o João', async (_, impl) => {
    const t = setup()
    await reachAgendando(t)
    t.schedule.mockImplementation(impl as any)
    t.sendWhatsApp.mockClear()
    expect(await t.say('1')).toBe(COPY.calendarFail)
    expect(t.session().stage).toBe('agendando')
    expect(t.session().appointment_id ?? null).toBeNull()
    expect(t.jobs()).toHaveLength(0)
    expect(t.sendWhatsApp).toHaveBeenCalledTimes(1)
    expect(t.sendWhatsApp).toHaveBeenCalledWith(OPS, expect.stringContaining('***7777'))
  })

  it('fluxo morno: move para morno e cria followup em +3 dias', async () => {
    const t = setup()
    await t.say('oi')
    await t.say('dentista')
    await t.say('quero marketing')
    await t.say('sim, faturo')
    const reply = await t.say('estou pesquisando')
    expect(reply).toBe(COPY.morno.replace('{plansUrl}', SETTINGS.plansUrl))
    expect(t.session()).toMatchObject({ stage: 'concluida', outcome: 'morno', score: 50 })
    expect(t.deal().stage_id).toBe('st-morno')
    expect(t.jobs()).toHaveLength(1)
    expect(t.jobs()[0]).toMatchObject({ kind: 'followup', session_id: t.session().id })
    expect(t.jobs()[0].run_at).toBe(new Date(NOW.getTime() + 3 * 86400_000).toISOString())
  })

  it('fluxo frio: move para curioso e aplica a tag curioso', async () => {
    const t = setup()
    await t.say('oi')
    await t.say('dentista')
    await t.say('quero um site')
    await t.say('não faturo ainda')
    await t.say('só pesquisando')
    expect(t.session()).toMatchObject({ stage: 'concluida', outcome: 'frio', score: 10 })
    expect(t.deal().stage_id).toBe('st-curioso')
    const tag = [...t.mem.table('tags').values()][0]
    expect(tag).toMatchObject({ name: 'curioso', account_id: 'acc-1' })
    expect([...t.mem.table('contact_tags').values()][0]).toMatchObject({ contact_id: 'contact-1', tag_id: tag.id })
  })

  it('Laya e Haiku fora: repete a pergunta da etapa e não muda a sessão', async () => {
    const t = setup()
    await t.say('oi')
    await t.say('dentista')
    const before = structuredClone(t.session())
    ;(t.deps.classify as any).mockImplementation(async () => {
      throw new Error('laya e haiku fora')
    })
    expect(await t.say('tráfego')).toBe(COPY.ask.interesse)
    expect(t.session()).toEqual(before)
    expect(t.session().unclear_count).toBe(0)
  })

  it('Laya e Haiku fora em agendando: repete a oferta', async () => {
    const t = setup()
    await reachAgendando(t)
    ;(t.deps.classify as any).mockImplementation(async () => {
      throw new Error('fora')
    })
    expect(await t.say('quinta?')).toBe(formatOffer(t.session().offered_slots))
    expect(t.session().stage).toBe('agendando')
  })

  it('saveSession perde a corrida: devolve null e não faz nenhum efeito', async () => {
    const t = setup()
    await reachAgendando(t)
    // outra mensagem concluiu a etapa enquanto esta era classificada
    ;(t.deps.classify as any).mockImplementation(async (...a: [string, LayaQuestion, string[]]) => {
      t.session().stage = 'concluida'
      return fakeClassify(...a)
    })
    t.sendWhatsApp.mockClear()
    expect(await t.say('1')).toBeNull()
    expect(t.schedule).not.toHaveBeenCalled()
    expect(t.sendWhatsApp).not.toHaveBeenCalled()
    expect(t.jobs()).toHaveLength(0)
  })

  it('duas mensagens seguidas: só uma transição e uma resposta', async () => {
    const t = setup()
    await t.say('oi')
    const replies = await Promise.all([t.say('sou dentista'), t.say('de Santos')])
    expect(replies.filter((r) => r !== null)).toHaveLength(1)
    expect(t.session().stage).toBe('interesse')
  })

  it('duas 1ªs mensagens simultâneas: a que perde a criação da sessão não responde', async () => {
    const t = setup()
    const replies = await Promise.all([t.say('oi'), t.say('tudo bem?')])
    expect(replies.filter((r) => r !== null)).toHaveLength(1)
    expect(t.mem.table('reception_sessions').size).toBe(1)
  })

  it('agenda sem Meet: responde meetPending e avisa o João', async () => {
    const t = setup()
    t.schedule.mockImplementation(async () => ({
      success: true,
      appointmentId: 'appt-2',
      meetUrl: '',
      calendarUrl: '',
      meetCreated: false,
      replyMessage: 'x',
    }))
    await reachAgendando(t)
    t.sendWhatsApp.mockClear()
    expect(await t.say('1')).toBe(COPY.meetPending)
    expect(t.sendWhatsApp).toHaveBeenCalledWith(OPS, expect.stringMatching(/Meet/))
    expect(t.session()).toMatchObject({ stage: 'concluida', appointment_id: 'appt-2' })
  })

  it('pedido de humano: pausa a IA com resumo sem telefone, avisa e a mensagem seguinte não é respondida', async () => {
    const t = setup()
    t.mem.table('conversations').set('conv-1', { id: 'conv-1' })
    await t.say('oi')
    await t.say('dentista')
    expect(await t.say('quero falar com um humano')).toBe(COPY.handoff)
    const conv = t.mem.table('conversations').get('conv-1')!
    expect(conv.ai_autoreply_disabled).toBe(true)
    expect(conv.ai_handoff_summary).toContain('dentista')
    expect(conv.ai_handoff_summary).not.toContain('88887777')
    expect(t.deal().stage_id).toBe('st-humano')
    expect(t.session()).toMatchObject({ stage: 'humano', outcome: 'humano' })
    expect(t.sendWhatsApp).toHaveBeenCalledWith(OPS, 'Lead ***7777 pediu humano')

    const calls = (t.deps.classify as any).mock.calls.length
    expect(await t.say('alô?')).toBeNull()
    expect((t.deps.classify as any).mock.calls.length).toBe(calls)
  })

  it('pedido de humano já na 1ª mensagem vira handoff', async () => {
    const t = setup()
    expect(await t.say('quero falar com uma pessoa')).toBe(COPY.handoff)
    expect(t.session().stage).toBe('humano')
  })

  it('erro inesperado de banco: loga sem telefone, avisa e devolve null', async () => {
    const t = setup()
    const errSpy = vi.mocked(console.error)
    t.deps.db = { from: () => { throw new Error('db caiu') } } as unknown as SupabaseClient
    expect(await t.say('oi')).toBeNull()
    expect(t.sendWhatsApp).toHaveBeenCalledWith(OPS, expect.stringContaining('***7777'))
    const logged = errSpy.mock.calls.flat().map(String).join(' ')
    expect(logged).toContain('***7777')
    expect(logged).not.toContain('5513988887777')
  })

  it('usa o phrase (Haiku) para a pergunta quando disponível', async () => {
    const t = setup()
    const phrase = vi.fn(async () => 'Qual é o seu nicho?')
    t.deps.phrase = phrase
    expect(await t.say('oi')).toBe('Qual é o seu nicho?')
    expect(phrase).toHaveBeenCalledWith(expect.stringContaining('nicho'), 'oi')
  })
})

describe('shouldStartReception', () => {
  const msg = (sender_type: string, content_text = 'x') => ({ conversation_id: 'conv-1', sender_type, content_text })

  it('conversa nova (só mensagens do lead): começa a triagem', async () => {
    const { mem } = setup()
    mem.table('messages').set('m1', msg('customer'))
    expect(await shouldStartReception(mem.db, 'conv-1')).toBe(true)
  })

  it.each(['bot', 'agent'])('conversa antiga com mensagem de %s: fica com o robô antigo', async (sender) => {
    const { mem } = setup()
    mem.table('messages').set('m1', msg('customer'))
    mem.table('messages').set('m2', msg(sender))
    expect(await shouldStartReception(mem.db, 'conv-1')).toBe(false)
  })

  it('o pedido de áudio por escrito não conta como conversa antiga', async () => {
    const { mem } = setup()
    mem.table('messages').set('m1', msg('bot', COPY.audioUnreadable))
    expect(await shouldStartReception(mem.db, 'conv-1')).toBe(true)
  })

  it('sessão já existente continua na recepcionista', async () => {
    const t = setup()
    await t.say('oi')
    t.mem.table('messages').set('m1', msg('bot'))
    expect(await shouldStartReception(t.mem.db, 'conv-1')).toBe(true)
  })
})
