import { describe, it, expect } from 'vitest'
import { advance, scoreLead } from './machine'
import type { ReceptionSession, ReceptionStage } from './types'

const base = (stage: ReceptionStage, over: Partial<ReceptionSession> = {}): ReceptionSession => ({
  id: 's', accountId: 'a', contactId: 'c', conversationId: 'v', dealId: null,
  stage, answers: {}, unclearCount: 0, outcome: null, score: null, origin: 'x',
  offeredSlots: [], slotRounds: 0, appointmentId: null, ...over,
})
const slots = [{ iso: '2026-10-14T12:00:00Z', label: 'qua 09h' }, { iso: '2026-10-14T13:00:00Z', label: 'qua 10h' }]

describe('scoreLead', () => {
  it('fatura+agora = quente 80+', () => {
    const r = scoreLead({ fatura: true, urgencia: 'agora' })
    expect(r.outcome).toBe('quente'); expect(r.score).toBeGreaterThanOrEqual(80)
  })
  it('!fatura+pesquisando = frio', () => {
    expect(scoreLead({ fatura: false, urgencia: 'pesquisando' }).outcome).toBe('frio')
  })
  it('fatura+pesquisando = morno', () => {
    expect(scoreLead({ fatura: true, urgencia: 'pesquisando' }).outcome).toBe('morno')
  })
  it('!fatura+agora = morno', () => {
    expect(scoreLead({ fatura: false, urgencia: 'agora' }).outcome).toBe('morno')
  })
  it('nota soma time e interesses', () => {
    expect(scoreLead({ fatura: true, urgencia: 'agora', temTime: true, interesses: ['crm'] }).score).toBe(100)
  })
})

describe('advance', () => {
  it('caminho feliz até agendando', () => {
    let s = base('nicho')
    let r = advance(s, { kind: 'nicho', nicho: 'dentista' })
    expect(r.session.stage).toBe('interesse'); expect(r.session.answers.nicho).toBe('dentista')
    expect(r.action).toEqual({ type: 'ask', stage: 'interesse', reask: false })
    r = advance(r.session, { kind: 'interesse', interesses: ['crm'] })
    expect(r.session.stage).toBe('momento')
    expect(r.action).toEqual({ type: 'ask', stage: 'momento', reask: false })
    r = advance(r.session, { kind: 'momento', fatura: true, temTime: false })
    expect(r.session.stage).toBe('urgencia')
    r = advance(r.session, { kind: 'urgencia', urgencia: 'agora' })
    expect(r.session.stage).toBe('agendando'); expect(r.session.outcome).toBe('quente')
    expect(r.session.score).toBe(90)
    expect(r.action).toEqual({ type: 'offer_slots' })
  })
  it('não muta a sessão de entrada', () => {
    const s = base('nicho'); advance(s, { kind: 'nicho', nicho: 'dentista' })
    expect(s.stage).toBe('nicho'); expect(s.answers).toEqual({})
  })
  it('morno e frio concluem', () => {
    const m = advance(base('urgencia', { answers: { fatura: true } }), { kind: 'urgencia', urgencia: 'pesquisando' })
    expect(m.action).toEqual({ type: 'morno' }); expect(m.session.stage).toBe('concluida')
    const f = advance(base('urgencia', { answers: { fatura: false } }), { kind: 'urgencia', urgencia: 'pesquisando' })
    expect(f.action).toEqual({ type: 'frio' }); expect(f.session.outcome).toBe('frio')
  })
  it('2º unclear seguido vai a handoff', () => {
    const a = advance(base('nicho'), { kind: 'unclear' })
    expect(a.action).toEqual({ type: 'ask', stage: 'nicho', reask: true }); expect(a.session.unclearCount).toBe(1)
    const b = advance(a.session, { kind: 'unclear' })
    expect(b.action).toEqual({ type: 'handoff' }); expect(b.session.stage).toBe('humano'); expect(b.session.outcome).toBe('humano')
  })
  it('unclear após leitura válida volta o contador para 1', () => {
    const a = advance(base('nicho', { unclearCount: 1 }), { kind: 'nicho', nicho: 'dentista' })
    expect(a.session.unclearCount).toBe(0)
    const b = advance(a.session, { kind: 'unclear' })
    expect(b.session.unclearCount).toBe(1); expect(b.action.type).toBe('ask')
  })
  it('leitura humano faz handoff', () => {
    const r = advance(base('interesse'), { kind: 'humano' })
    expect(r.action).toEqual({ type: 'handoff' }); expect(r.session.stage).toBe('humano'); expect(r.session.outcome).toBe('humano')
  })
  it('slot_none duas vezes: reoferta e depois handoff', () => {
    const s = base('agendando', { offeredSlots: slots })
    const a = advance(s, { kind: 'slot_none' })
    expect(a.action).toEqual({ type: 'offer_slots' }); expect(a.session.slotRounds).toBe(1)
    const b = advance(a.session, { kind: 'slot_none' })
    expect(b.action).toEqual({ type: 'handoff' }); expect(b.session.stage).toBe('humano')
  })
  it('slot válido agenda; fora da lista conta como unclear', () => {
    const s = base('agendando', { offeredSlots: slots })
    expect(advance(s, { kind: 'slot', index: 1 }).action).toEqual({ type: 'book', slot: slots[1] })
    const bad = advance(s, { kind: 'slot', index: 5 })
    expect(bad.action).toEqual({ type: 'reoffer' }); expect(bad.session.unclearCount).toBe(1)
    expect(advance(bad.session, { kind: 'slot', index: -1 }).action).toEqual({ type: 'handoff' })
  })
  it('unclear em agendando reoferece', () => {
    expect(advance(base('agendando', { offeredSlots: slots }), { kind: 'unclear' }).action).toEqual({ type: 'reoffer' })
  })
  it('etapa humano é silent', () => {
    for (const r of [{ kind: 'unclear' }, { kind: 'humano' }, { kind: 'nicho', nicho: 'x' }] as const)
      expect(advance(base('humano'), r).action).toEqual({ type: 'silent' })
  })
  it('concluida: free_reply, humano vai a handoff', () => {
    expect(advance(base('concluida'), { kind: 'nicho', nicho: 'abc' }).action).toEqual({ type: 'free_reply' })
    expect(advance(base('concluida'), { kind: 'unclear' }).action).toEqual({ type: 'free_reply' })
    const h = advance(base('concluida'), { kind: 'humano' })
    expect(h.action).toEqual({ type: 'handoff' }); expect(h.session.stage).toBe('humano')
  })
})
