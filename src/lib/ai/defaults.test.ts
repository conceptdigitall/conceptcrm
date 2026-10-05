import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, buildDateContext } from './defaults'

// 05/10/2026 17:30 em São Paulo (UTC-3) = 20:30 UTC. Segunda-feira.
const MONDAY_5PM = new Date('2026-10-05T20:30:00Z')

describe('buildDateContext', () => {
  it('diz o dia da semana e a data de hoje no fuso de São Paulo', () => {
    const ctx = buildDateContext(MONDAY_5PM)
    expect(ctx).toContain('Hoje é segunda-feira, 5 de outubro de 2026')
    expect(ctx).toContain('17:30')
  })

  it('lista os próximos dias já calculados (amanhã = terça, 6/10)', () => {
    const ctx = buildDateContext(MONDAY_5PM)
    expect(ctx).toContain('amanhã: terça-feira, 6 de outubro')
    expect(ctx).toContain('domingo, 11 de outubro')
  })

  it('usa o fuso de São Paulo, não UTC (22h em SP já é outro dia em UTC)', () => {
    // 05/10 22:00 em SP = 06/10 01:00 UTC
    const ctx = buildDateContext(new Date('2026-10-06T01:00:00Z'))
    expect(ctx).toContain('Hoje é segunda-feira, 5 de outubro de 2026')
  })
})

describe('buildSystemPrompt', () => {
  it('inclui a data de hoje no prompt', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      now: MONDAY_5PM,
    })
    expect(prompt).toContain('Hoje é segunda-feira, 5 de outubro de 2026')
  })
})
