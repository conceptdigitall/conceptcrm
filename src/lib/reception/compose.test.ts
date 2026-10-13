import { describe, it, expect } from 'vitest'
import { applyGuardrails, composeReply, formatOffer, fill, COPY } from './compose'

const url = 'https://x.com/planos'
const ctx = { leadText: 'oi', plansUrl: url, firstName: 'Ana' }

describe('applyGuardrails', () => {
  it('bloqueia preço em R$', () => {
    expect(applyGuardrails('Fica R$ 1.200 por mês', url)).toBe(fill(COPY.guardrail, { plansUrl: url }))
  })
  it('bloqueia prazo', () => {
    expect(applyGuardrails('Entrego em 15 dias', url)).toBe(fill(COPY.guardrail, { plansUrl: url }))
  })
  it('deixa passar data e hora', () => {
    expect(applyGuardrails('Nossa call é ter, 14/10 às 10h', url)).toBe('Nossa call é ter, 14/10 às 10h')
  })
  it('remove asteriscos', () => {
    expect(applyGuardrails('**Oi** tudo bem', url)).toBe('Oi tudo bem')
  })
})

describe('formatOffer', () => {
  it('formata 3 slots', () => {
    const slots = [
      { iso: 'a', label: 'ter, 14/10 às 10h' },
      { iso: 'b', label: 'ter, 14/10 às 14h' },
      { iso: 'c', label: 'qua, 15/10 às 9h' },
    ]
    expect(formatOffer(slots)).toBe(
      'Tenho estes horários para uma call de 30 min no Google Meet:\n1) ter, 14/10 às 10h\n2) ter, 14/10 às 14h\n3) qua, 15/10 às 9h\nQual fica melhor? Responde com o número.',
    )
  })
})

describe('composeReply', () => {
  const fail = async () => { throw new Error('boom') }
  it('ask cai no texto fixo quando phrase rejeita', async () => {
    expect(await composeReply({ type: 'ask', stage: 'nicho', reask: false }, ctx, fail)).toBe(COPY.ask.nicho)
  })
  it('ask usa phrase e avisa reask no objetivo', async () => {
    let goal = ''
    const r = await composeReply({ type: 'ask', stage: 'momento', reask: true }, ctx, async (g) => { goal = g; return 'Pergunta?' })
    expect(r).toBe('Pergunta?')
    expect(goal).toContain('reformule')
  })
  it('free_reply passa pelo guardrail', async () => {
    const r = await composeReply({ type: 'free_reply' }, ctx, async () => 'Custa R$ 500')
    expect(r).toBe(fill(COPY.guardrail, { plansUrl: url }))
  })
  it('morno, handoff, reoffer fixos', async () => {
    expect(await composeReply({ type: 'morno' }, ctx, fail)).toBe(fill(COPY.morno, { plansUrl: url }))
    expect(await composeReply({ type: 'handoff' }, ctx, fail)).toBe(COPY.handoff)
    const slots = [{ iso: 'a', label: 'L1' }]
    expect(await composeReply({ type: 'reoffer' }, { ...ctx, offeredSlots: slots }, fail)).toBe(formatOffer(slots))
  })
  it('null para silent, book, offer_slots', async () => {
    expect(await composeReply({ type: 'silent' }, ctx, fail)).toBeNull()
    expect(await composeReply({ type: 'offer_slots' }, ctx, fail)).toBeNull()
    expect(await composeReply({ type: 'book', slot: { iso: 'a', label: 'b' } }, ctx, fail)).toBeNull()
  })
})
