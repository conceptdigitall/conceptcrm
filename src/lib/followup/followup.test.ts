import { describe, expect, it } from 'vitest'
import {
  COOLING_MIN_DAYS,
  buildFollowupPrompt,
  cleanFollowupText,
  coolingDays,
  firstNameOf,
  outboundSinceLastReply,
  pickAngle,
  similarity,
  tooSimilar,
} from './followup'

const now = new Date('2026-11-24T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

describe('coolingDays', () => {
  it('flags a lead when our message has waited at least the minimum', () => {
    expect(coolingDays({ sender_type: 'agent', created_at: daysAgo(3) }, now)).toBe(3)
    expect(coolingDays({ sender_type: 'bot', created_at: daysAgo(COOLING_MIN_DAYS) }, now)).toBe(2)
  })
  it('ignores customers who spoke last, fresh messages and dead leads', () => {
    expect(coolingDays({ sender_type: 'customer', created_at: daysAgo(10) }, now)).toBeNull()
    expect(coolingDays({ sender_type: 'agent', created_at: daysAgo(1) }, now)).toBeNull()
    expect(coolingDays({ sender_type: 'agent', created_at: daysAgo(90) }, now)).toBeNull()
    expect(coolingDays(null, now)).toBeNull()
  })
})

describe('firstNameOf', () => {
  it('returns a capitalised first name', () => {
    expect(firstNameOf('camila sousa')).toBe('Camila')
  })
  it('skips numbers and generic names', () => {
    expect(firstNameOf('5513999990000')).toBe('')
    expect(firstNameOf('Novo Lead')).toBe('')
    expect(firstNameOf(null)).toBe('')
  })
})

describe('similarity / tooSimilar', () => {
  it('catches near-duplicates and lets different messages through', () => {
    const a = 'Opa Ana, tudo certo? Conseguiu dar uma olhada no site?'
    expect(similarity(a, a)).toBe(1)
    expect(tooSimilar('Opa Ana, tudo certo? Conseguiu olhar o site?', [a])).toBe(true)
    expect(tooSimilar('E aí, Ana! Ficou alguma dúvida da proposta que eu tiro rapidinho?', [a])).toBe(false)
  })
})

describe('cleanFollowupText', () => {
  it('strips quotes, markdown and em dashes', () => {
    expect(cleanFollowupText('"Opa — tudo **certo**?"')).toBe('Opa, tudo certo?')
  })
})

describe('outboundSinceLastReply', () => {
  it('returns only what we sent after the customer last spoke', () => {
    const rows = [
      { sender_type: 'agent', content_text: 'proposta antiga' },
      { sender_type: 'customer', content_text: 'vou ver' },
      { sender_type: 'agent', content_text: 'segue a proposta' },
      { sender_type: 'bot', content_text: 'e aí, o que achou?' },
    ]
    expect(outboundSinceLastReply(rows)).toEqual(['segue a proposta', 'e aí, o que achou?'])
  })
})

describe('pickAngle / buildFollowupPrompt', () => {
  it('rotates angles with the number of previous follow-ups', () => {
    const fixed = () => 0
    expect(pickAngle(0, fixed)).not.toBe(pickAngle(1, fixed))
  })
  it('includes humanizer rules and previous follow-ups to avoid', () => {
    const { system, user } = buildFollowupPrompt({
      firstName: 'Ana',
      daysWaiting: 4,
      dealContext: 'Site clínica · Proposta enviada',
      transcript: 'Nós: segue a proposta',
      previousFollowups: ['Opa Ana, conseguiu ver?'],
      angle: 'pergunte o que ela achou',
    })
    expect(system).toMatch(/Humanizer/)
    expect(system).toMatch(/travessão/)
    expect(user).toContain('Opa Ana, conseguiu ver?')
    expect(user).toContain('4 dias')
  })
})
