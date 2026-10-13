import { describe, expect, it, vi } from 'vitest'
import type { LayaQuestion } from '@/lib/prospecting/columns'
import { makeClassify, readAnswer, type Classify } from './classify'
import type { ReceptionSession } from './types'

const q: LayaQuestion = { type: 'choice', instructions: 'Urgência?', criteria: { agora: 'agora', pesquisando: 'pesquisando' } }
const opts = ['agora', 'pesquisando']

describe('makeClassify', () => {
  it('aceita Laya com top-1 >= 0.7 sem chamar Haiku', async () => {
    const haiku = vi.fn()
    const c = makeClassify({ laya: async () => ({ probabilities: { agora: 0.82, pesquisando: 0.18 } }), haiku })
    expect(await c('quero já', q, opts)).toBe('agora')
    expect(haiku).not.toHaveBeenCalled()
  })

  it('cai no Haiku quando top-1 < 0.7', async () => {
    const haiku = vi.fn().mockResolvedValue('pesquisando')
    const c = makeClassify({ laya: async () => ({ probabilities: { agora: 0.6, pesquisando: 0.4 } }), haiku })
    expect(await c('talvez', q, opts)).toBe('pesquisando')
    expect(haiku).toHaveBeenCalledWith('talvez', q, [...opts, 'indefinido'])
  })

  it('cai no Haiku quando a Laya lança erro', async () => {
    const haiku = vi.fn().mockResolvedValue('agora')
    const c = makeClassify({ laya: async () => { throw new Error('off') }, haiku })
    expect(await c('x', q, opts)).toBe('agora')
  })

  it('vai direto ao Haiku sem Laya configurada', async () => {
    const haiku = vi.fn().mockResolvedValue('agora')
    expect(await makeClassify({ haiku })('x', q, opts)).toBe('agora')
  })

  it('lança quando Laya e Haiku falham', async () => {
    const c = makeClassify({
      laya: async () => { throw new Error('off') },
      haiku: async () => { throw new Error('off') },
    })
    await expect(c('x', q, opts)).rejects.toThrow()
  })

  it('noul: sim só com confiança >= 0.7', async () => {
    const nq: LayaQuestion = { type: 'noul', instructions: 'ok?' }
    const haiku = vi.fn().mockResolvedValue('não')
    const sure = makeClassify({ laya: async () => ({ noul: 0.9 }), haiku })
    expect(await sure('x', nq, ['sim', 'não'])).toBe('sim')
    const no = makeClassify({ laya: async () => ({ noul: 0.1 }), haiku })
    expect(await no('x', nq, ['sim', 'não'])).toBe('não')
    expect(haiku).not.toHaveBeenCalled()
    const unsure = makeClassify({ laya: async () => ({ noul: 0.6 }), haiku })
    expect(await unsure('x', nq, ['sim', 'não'])).toBe('não')
    expect(haiku).toHaveBeenCalledTimes(1)
  })

  it('troca resposta do Haiku fora das opções por indefinido', async () => {
    const c = makeClassify({ haiku: async () => 'sei lá' })
    expect(await c('x', q, opts)).toBe('indefinido')
  })
})

const session = (over: Partial<ReceptionSession> = {}): ReceptionSession => ({
  id: 's', accountId: 'a', contactId: 'c', conversationId: 'v', dealId: null, stage: 'nicho',
  answers: {}, unclearCount: 0, outcome: null, score: null, origin: 'x',
  offeredSlots: [], slotRounds: 0, appointmentId: null, ...over,
})

// Fake classify routed by a substring of the question instructions.
const fake = (rules: Record<string, string>, fallback = 'não'): Classify =>
  vi.fn(async (_t, question) => {
    const hit = Object.keys(rules).find((k) => question.instructions.includes(k))
    return hit ? rules[hit] : fallback
  })

describe('readAnswer', () => {
  it('pedido de humano vence qualquer etapa', async () => {
    const c = fake({ pessoa: 'sim' })
    expect(await readAnswer('nicho', 'quero falar com atendente', session(), c)).toEqual({ kind: 'humano' })
  })

  it('nicho: texto com letras vira nicho; curto vira unclear', async () => {
    const c = fake({})
    expect(await readAnswer('nicho', '  Clínica odontológica ', session(), c)).toEqual({ kind: 'nicho', nicho: 'Clínica odontológica' })
    expect(await readAnswer('nicho', '??', session(), c)).toEqual({ kind: 'unclear' })
  })

  it('interesse: junta todos os noul = sim', async () => {
    const c = fake({ 'marketing com IA': 'sim', 'CRM': 'sim' })
    const r = await readAnswer('interesse', 'quero conteúdo e crm', session({ stage: 'interesse' }), c)
    expect(r).toEqual({ kind: 'interesse', interesses: ['marketing_ia', 'crm'] })
  })

  it('interesse: nenhum sim vira unclear', async () => {
    expect(await readAnswer('interesse', 'hm', session(), fake({}))).toEqual({ kind: 'unclear' })
  })

  it('momento: fatura e temTime; temTime indefinido vira false; fatura indefinido vira unclear', async () => {
    const ok = fake({ fatura: 'sim', 'time': 'indefinido' })
    expect(await readAnswer('momento', 'x', session(), ok)).toEqual({ kind: 'momento', fatura: true, temTime: false })
    const bad = fake({ fatura: 'indefinido' })
    expect(await readAnswer('momento', 'x', session(), bad)).toEqual({ kind: 'unclear' })
  })

  it('urgencia: usa choice agora/pesquisando', async () => {
    const c = fake({ urgência: 'agora' })
    expect(await readAnswer('urgencia', 'preciso já', session(), c)).toEqual({ kind: 'urgencia', urgencia: 'agora' })
    expect(await readAnswer('urgencia', '??', session(), fake({ urgência: 'indefinido' }))).toEqual({ kind: 'unclear' })
  })

  it('agendando: "2" vira slot index 1 sem classificar além do humano', async () => {
    const c = fake({})
    const s = session({ stage: 'agendando', offeredSlots: [{ iso: 'a', label: 'A' }, { iso: 'b', label: 'B' }] })
    expect(await readAnswer('agendando', '2', s, c)).toEqual({ kind: 'slot', index: 1 })
    expect(c).toHaveBeenCalledTimes(1)
  })

  it('agendando: "pode ser quinta 15h?" vira slot_none', async () => {
    const c = fake({ horário: 'nenhum' })
    const s = session({ stage: 'agendando', offeredSlots: [{ iso: 'a', label: 'A' }] })
    expect(await readAnswer('agendando', 'pode ser quinta 15h?', s, c)).toEqual({ kind: 'slot_none' })
  })

  it('agendando: escolha por label e indefinido', async () => {
    const s = session({ stage: 'agendando', offeredSlots: [{ iso: 'a', label: 'seg 10h' }, { iso: 'b', label: 'ter 11h' }] })
    expect(await readAnswer('agendando', 'a de terça', s, fake({ horário: 'ter 11h' }))).toEqual({ kind: 'slot', index: 1 })
    expect(await readAnswer('agendando', '??', s, fake({ horário: 'indefinido' }))).toEqual({ kind: 'unclear' })
  })
})
