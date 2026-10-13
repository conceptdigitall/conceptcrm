import type { Answers, OfferedSlot, ReceptionSession } from './types'
import type { StageReading } from './classify'

export type Action =
  | { type: 'ask'; stage: 'nicho' | 'interesse' | 'momento' | 'urgencia'; reask: boolean }
  | { type: 'offer_slots' }
  | { type: 'reoffer' }
  | { type: 'book'; slot: OfferedSlot }
  | { type: 'morno' }
  | { type: 'frio' }
  | { type: 'handoff' }
  | { type: 'free_reply' }
  | { type: 'silent' }

export function scoreLead(a: Answers): { outcome: 'quente' | 'morno' | 'frio'; score: number } {
  const fatura = a.fatura === true
  const agora = a.urgencia === 'agora'
  const score = (fatura ? 40 : 0) + (agora ? 40 : 0) + (a.temTime ? 10 : 0) + ((a.interesses?.length ?? 0) >= 1 ? 10 : 0)
  const outcome = fatura && agora ? 'quente' : !fatura && a.urgencia === 'pesquisando' ? 'frio' : 'morno'
  return { outcome, score }
}

type AskStage = 'nicho' | 'interesse' | 'momento' | 'urgencia'

function handoff(s: ReceptionSession): { session: ReceptionSession; action: Action } {
  return { session: { ...s, stage: 'humano', outcome: 'humano' }, action: { type: 'handoff' } }
}

function unclear(s: ReceptionSession): { session: ReceptionSession; action: Action } {
  const unclearCount = s.unclearCount + 1
  if (unclearCount >= 2) return handoff({ ...s, unclearCount })
  const session = { ...s, unclearCount }
  if (s.stage === 'agendando') return { session, action: { type: 'reoffer' } }
  return { session, action: { type: 'ask', stage: s.stage as AskStage, reask: true } }
}

export function advance(s: ReceptionSession, r: StageReading): { session: ReceptionSession; action: Action } {
  if (s.stage === 'humano') return { session: { ...s }, action: { type: 'silent' } }
  if (s.stage === 'concluida') {
    return r.kind === 'humano' ? handoff(s) : { session: { ...s }, action: { type: 'free_reply' } }
  }
  if (r.kind === 'humano') return handoff(s)
  if (r.kind === 'unclear') return unclear(s)

  if (s.stage === 'agendando') {
    if (r.kind === 'slot') {
      const slot = s.offeredSlots[r.index]
      if (!Number.isInteger(r.index) || !slot) return unclear(s)
      return { session: { ...s, unclearCount: 0 }, action: { type: 'book', slot } }
    }
    if (r.kind === 'slot_none') {
      if (s.slotRounds < 1) {
        return { session: { ...s, slotRounds: s.slotRounds + 1, unclearCount: 0 }, action: { type: 'offer_slots' } }
      }
      return handoff(s)
    }
    return unclear(s)
  }

  const base = { ...s, unclearCount: 0 }
  if (s.stage === 'nicho' && r.kind === 'nicho') {
    return { session: { ...base, stage: 'interesse', answers: { ...s.answers, nicho: r.nicho } }, action: { type: 'ask', stage: 'interesse', reask: false } }
  }
  if (s.stage === 'interesse' && r.kind === 'interesse') {
    return { session: { ...base, stage: 'momento', answers: { ...s.answers, interesses: r.interesses } }, action: { type: 'ask', stage: 'momento', reask: false } }
  }
  if (s.stage === 'momento' && r.kind === 'momento') {
    return {
      session: { ...base, stage: 'urgencia', answers: { ...s.answers, fatura: r.fatura, temTime: r.temTime } },
      action: { type: 'ask', stage: 'urgencia', reask: false },
    }
  }
  if (s.stage === 'urgencia' && r.kind === 'urgencia') {
    const answers = { ...s.answers, urgencia: r.urgencia }
    const { outcome, score } = scoreLead(answers)
    if (outcome === 'quente') return { session: { ...base, answers, outcome, score, stage: 'agendando' }, action: { type: 'offer_slots' } }
    return { session: { ...base, answers, outcome, score, stage: 'concluida' }, action: { type: outcome } }
  }
  // leitura incompatível com a etapa: trata como não entendida
  return unclear(s)
}
