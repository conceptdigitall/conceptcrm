import { describe, expect, it } from 'vitest'
import { buildEvolutionHistory } from './evolution-history'

const c = (t: string) => ({ sender_type: 'customer', content_text: t })
const b = (t: string) => ({ sender_type: 'bot', content_text: t })

describe('buildEvolutionHistory', () => {
  it('junta mensagens seguidas do cliente em vez de perder a segunda', () => {
    const out = buildEvolutionHistory(
      [b('Até terça às 17h30.'), c('Combinamos na Segunda ??'), c('No caso hoje')],
      'No caso hoje',
    )
    expect(out).toEqual([{ role: 'user', content: 'Combinamos na Segunda ??\nNo caso hoje' }])
  })

  it('começa sempre pelo cliente e termina com a mensagem atual', () => {
    const out = buildEvolutionHistory([c('oi'), b('Olá!'), c('18h')], '18h')
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(out[2].content).toBe('18h')
  })

  it('acrescenta a mensagem atual se ela não foi salva no banco', () => {
    const out = buildEvolutionHistory([c('oi'), b('Olá!')], 'quero um site')
    expect(out[out.length - 1]).toEqual({ role: 'user', content: 'quero um site' })
  })

  it('ignora mensagens vazias', () => {
    const out = buildEvolutionHistory([c(''), { sender_type: 'customer', content_text: null }], 'oi')
    expect(out).toEqual([{ role: 'user', content: 'oi' }])
  })
})
