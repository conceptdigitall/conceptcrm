import { describe, expect, it } from 'vitest'
import {
  HUMAN_SENTINEL,
  KNOWLEDGE_CHAR_LIMIT,
  buildCandidateModels,
  buildEvolutionSystemPrompt,
  isEchoOfCrmSend,
  isHumanHandoffReply,
  joinKnowledge,
} from './evolution-bot'

describe('isHumanHandoffReply', () => {
  it('detects the sentinel, with or without extra text', () => {
    expect(isHumanHandoffReply(HUMAN_SENTINEL)).toBe(true)
    expect(isHumanHandoffReply(` ${HUMAN_SENTINEL}\n`)).toBe(true)
    expect(isHumanHandoffReply('[humano]')).toBe(true)
  })
  it('ignores normal replies and empty text', () => {
    expect(isHumanHandoffReply('Claro, posso te mostrar uma demonstração.')).toBe(false)
    expect(isHumanHandoffReply('')).toBe(false)
    expect(isHumanHandoffReply(null)).toBe(false)
  })
})

describe('buildCandidateModels', () => {
  it('puts the settings model first, then env, then fallbacks, deduped', () => {
    expect(buildCandidateModels('claude-sonnet-5-5', 'claude-haiku-4-5')).toEqual([
      'claude-sonnet-5-5',
      'claude-haiku-4-5',
    ])
    expect(buildCandidateModels(null, undefined)).toEqual(['claude-sonnet-5-5', 'claude-haiku-4-5'])
  })
  it('never includes retired claude-3 models', () => {
    expect(buildCandidateModels(null, null).some((m) => m.startsWith('claude-3'))).toBe(false)
  })
})

describe('joinKnowledge', () => {
  it('joins docs with titles and skips empty ones', () => {
    const out = joinKnowledge([
      { title: 'Base', content: 'Pacote de R$ 1.000 a R$ 1.500' },
      { title: 'Vazio', content: '   ' },
    ])
    expect(out).toContain('### Base')
    expect(out).not.toContain('Vazio')
  })
  it('caps very large knowledge bases', () => {
    const out = joinKnowledge([{ title: null, content: 'x'.repeat(KNOWLEDGE_CHAR_LIMIT + 500) }])
    expect(out.length).toBe(KNOWLEDGE_CHAR_LIMIT)
  })
})

describe('buildEvolutionSystemPrompt', () => {
  const base = { nowBrasilia: 'terça-feira', dateContext: 'HOJE', userName: 'Camila' }

  it('tells the model to stay quiet on personal conversations', () => {
    const p = buildEvolutionSystemPrompt(base)
    expect(p).toContain(HUMAN_SENTINEL)
    expect(p).toMatch(/pessoal/)
    expect(p).toMatch(/Nunca invente fatos sobre a pessoa/)
  })
  it('uses the saved persona and knowledge base when present', () => {
    const p = buildEvolutionSystemPrompt({ ...base, persona: 'PERSONA SALVA', knowledge: 'KB AQUI' })
    expect(p).toContain('PERSONA SALVA')
    expect(p).toContain('KB AQUI')
  })
})

describe('isEchoOfCrmSend', () => {
  const recent = [
    { message_id: 'ABC', content_text: 'Oi, tudo bem?' },
    { message_id: null, content_text: 'Fico feliz!  Qualquer coisa é só chamar.' },
  ]
  it('matches by message id', () => {
    expect(isEchoOfCrmSend(recent, { messageId: 'ABC', text: 'outro' })).toBe(true)
  })
  it('matches by text when the bot row has no id yet (whitespace-insensitive)', () => {
    expect(
      isEchoOfCrmSend(recent, { messageId: 'NEW', text: 'Fico feliz! Qualquer coisa é só chamar.' }),
    ).toBe(true)
  })
  it('treats anything else as the owner typing on the phone', () => {
    expect(isEchoOfCrmSend(recent, { messageId: 'NEW', text: 'Valeu, Camila! ❤️' })).toBe(false)
    expect(isEchoOfCrmSend([], { messageId: null, text: '' })).toBe(false)
  })
})

describe('attendant handoff', () => {
  it('reads the summary after the sentinel', async () => {
    const { parseAttendantRequest, ATTENDANT_SENTINEL, isHumanHandoffReply: isHuman } = await import('./evolution-bot')
    expect(parseAttendantRequest(`${ATTENDANT_SENTINEL} Quer orçamento de **loja** e prefere uma pessoa.`)).toEqual({
      summary: 'Quer orçamento de loja e prefere uma pessoa.',
    })
    expect(parseAttendantRequest('[atendente]')).toEqual({ summary: '' })
    expect(parseAttendantRequest('Oi, tudo bem?')).toBeNull()
    expect(isHuman(`${ATTENDANT_SENTINEL} algo`)).toBe(false)
  })

  it('notifies the four partners plus extra numbers, without duplicates', async () => {
    const { partnerNotificationNumbers, isPartnerNumber } = await import('./evolution-bot')
    const list = partnerNotificationNumbers('13978071057, 11 91234-5678')
    expect(list).toEqual(['5513978071057', '5513982292700', '5511997396671', '5513981958787', '5511912345678'])
    expect(isPartnerNumber('5513981958787')).toBe(true)
    expect(isPartnerNumber('13982292700')).toBe(true)
    expect(isPartnerNumber('5513991382442')).toBe(false)
  })

  it('builds the partner alert with contact, topic and CRM link', async () => {
    const { buildAttendantAlert } = await import('./evolution-bot')
    const text = buildAttendantAlert({
      contactName: 'Ana',
      phone: '5513999990000',
      summary: 'Quer loja virtual',
      lastMessage: 'quero falar com uma pessoa',
      conversationUrl: 'https://crm.test/inbox?c=1',
    })
    expect(text).toContain('Contato: Ana')
    expect(text).toContain('+5513999990000')
    expect(text).toContain('Assunto: Quer loja virtual')
    expect(text).toContain('https://crm.test/inbox?c=1')
  })

  it('tells the model how to ask for an attendant', () => {
    const prompt = buildEvolutionSystemPrompt({ persona: null, knowledge: '', nowBrasilia: 'x', dateContext: '', userName: 'Ana' })
    expect(prompt).toContain('[ATENDENTE]')
  })
})
