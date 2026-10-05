import { cleanReplyFormatting } from './clean-formatting'

export interface HistoryRow {
  sender_type: string
  content_text: string | null
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Quantas mensagens recentes o robô da Evolution lê. Eram 6, pouco para
 *  lembrar o que foi combinado (ex.: dia da reunião). */
export const EVOLUTION_HISTORY_LIMIT = 20

/**
 * Monta o histórico para a API da Anthropic a partir das mensagens salvas
 * (ordem cronológica). Mensagens seguidas do mesmo lado são JUNTADAS; antes a
 * segunda era descartada, e o robô perdia coisas como "Combinamos na segunda??"
 * + "No caso hoje". A conversa sempre começa e termina com o cliente.
 */
export function buildEvolutionHistory(
  rows: HistoryRow[],
  userMessage: string,
): HistoryMessage[] {
  const out: HistoryMessage[] = []
  for (const m of rows) {
    const content = m.content_text ? cleanReplyFormatting(m.content_text) : ''
    if (!content) continue
    const role = m.sender_type === 'customer' ? 'user' : 'assistant'
    const last = out[out.length - 1]
    if (last && last.role === role) {
      last.content += `\n${content}`
    } else {
      out.push({ role, content })
    }
  }

  // A API exige começar pelo cliente.
  while (out.length > 0 && out[0].role === 'assistant') out.shift()

  const last = out[out.length - 1]
  if (!last || last.role !== 'user') {
    out.push({ role: 'user', content: userMessage })
  } else if (!last.content.includes(userMessage)) {
    // A mensagem atual não chegou a ser salva no banco.
    last.content += `\n${userMessage}`
  }
  return out
}
