// ============================================================
// Follow-up de lead parado: a última mensagem foi nossa (proposta,
// orçamento, link do site) e o cliente não respondeu. Gera um lembrete
// curto, com cara de pessoa, sempre diferente dos anteriores.
// ============================================================

/** A partir de quantos dias sem resposta o lead aparece como "esfriando". */
export const COOLING_MIN_DAYS = 2
/** Depois disso o lead é considerado perdido e sai da lista. */
export const COOLING_MAX_DAYS = 60

const DAY_MS = 24 * 60 * 60 * 1000

export interface LastMessage {
  sender_type: string
  created_at: string
}

/** Dias esperando resposta, ou null se não está esfriando. */
export function coolingDays(last: LastMessage | null | undefined, now: Date = new Date()): number | null {
  if (!last || last.sender_type === 'customer') return null
  const days = Math.floor((now.getTime() - new Date(last.created_at).getTime()) / DAY_MS)
  if (days < COOLING_MIN_DAYS || days > COOLING_MAX_DAYS) return null
  return days
}

/** Ângulos sorteados para cada geração: força variedade além da temperatura. */
export const FOLLOWUP_ANGLES = [
  'pergunte de forma leve se a pessoa conseguiu dar uma olhada no que você mandou',
  'pergunte o que ela achou, se gostou ou se mudaria alguma coisa',
  'pergunte se ficou alguma dúvida que você possa tirar rapidinho',
  'pergunte se ela quer seguir com a ideia ou se prefere deixar para outro momento, sem pressão',
  'ofereça ajustar algum detalhe da proposta se algo não encaixou',
  'puxe o assunto de forma casual, como quem lembrou dela, e pergunte como está a ideia',
  'pergunte se dá para marcar uma conversa rápida para fechar os detalhes',
] as const

export function pickAngle(previousCount: number, rand: () => number = Math.random): string {
  // Gira pelos ângulos e sorteia dentro da rodada para não repetir em sequência.
  const offset = previousCount % FOLLOWUP_ANGLES.length
  const jitter = Math.floor(rand() * 3)
  return FOLLOWUP_ANGLES[(offset + jitter) % FOLLOWUP_ANGLES.length]
}

/** Regras do Humanizer em pt-BR, resumidas para WhatsApp. */
export const HUMANIZER_RULES = `ESCREVA COMO PESSOA (regras do Humanizer):
- Nada de contraste encenado ("não é só X, é Y", "mais do que X").
- Nada de frase final de efeito que repete o que já foi dito.
- Nada de trio forçado de adjetivos ou de exemplos.
- Não use travessão (—) nem dois-pontos dramáticos.
- Sem linguagem de vendedor: "oportunidade imperdível", "transformar seu negócio", "alavancar", "solução completa", "ativos digitais", "engenharia de vendas".
- Sem abertura encenada ("Passando aqui para...", "Espero que esteja bem!", "Só um lembrete gentil").
- Sem negrito, asteriscos, listas ou emojis em excesso (no máximo 1 emoji, e só se couber).
- Frases curtas e de tamanhos diferentes, português do dia a dia, do jeito que o João escreve no WhatsApp ("opa", "e aí", "tudo certo?", "o que achou?").`

export interface FollowupPromptArgs {
  firstName: string
  daysWaiting: number | null
  /** Título e etapa do negócio aberto, se houver (ex.: "Site barbearia" · "Proposta enviada"). */
  dealContext?: string | null
  /** Conversa recente em ordem cronológica, já rotulada (Cliente:/Nós:). */
  transcript: string
  /** Follow-ups que já mandamos antes: o novo não pode parecer com nenhum. */
  previousFollowups: string[]
  angle: string
}

export function buildFollowupPrompt(a: FollowupPromptArgs): { system: string; user: string } {
  const system = `Você escreve mensagens de WhatsApp do João, da Concept Digital (sites, CRMs e sistemas).
Tarefa: escrever UMA mensagem de follow-up para um cliente que recebeu uma proposta ou material e não respondeu.

${HUMANIZER_RULES}

REGRAS:
- 1 a 3 frases curtas. Máximo de 280 caracteres.
- Trate a pessoa pelo primeiro nome só se for um nome de verdade.
- Use só fatos que estão na conversa. Não invente valor, prazo, desconto nem detalhe da proposta.
- Nada de pressão, culpa ou urgência falsa.
- A mensagem precisa ser bem diferente das anteriores: outra abertura, outra pergunta, outras palavras.
- Responda só com o texto da mensagem, sem aspas e sem explicação.`

  const previous = a.previousFollowups.length
    ? a.previousFollowups.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : '(nenhum)'

  const user = `Cliente: ${a.firstName || '(sem nome)'}
${a.daysWaiting != null ? `Sem resposta há ${a.daysWaiting} dias.` : ''}
${a.dealContext ? `Negócio: ${a.dealContext}` : ''}

Conversa recente:
${a.transcript || '(sem histórico salvo)'}

Mensagens que já mandamos depois que o cliente parou de responder (NÃO repita abertura, pergunta nem palavras-chave delas):
${previous}

Ângulo desta vez: ${a.angle}.`

  return { system, user }
}

/** Primeiro nome "de verdade" (ignora números e nomes genéricos). */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name || '').trim().split(/\s+/)[0] || ''
  if (!first || /\d/.test(first) || /^(novo|lead|cliente)$/i.test(first)) return ''
  return first.charAt(0).toUpperCase() + first.slice(1)
}

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )
}

/** Similaridade de Jaccard entre palavras (0 a 1). */
export function similarity(a: string, b: string): number {
  const A = words(a)
  const B = words(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

export const MAX_SIMILARITY = 0.5

export function tooSimilar(candidate: string, previous: string[]): boolean {
  return previous.some((p) => similarity(candidate, p) >= MAX_SIMILARITY)
}

/** Limpa o que o modelo às vezes devolve em volta do texto. */
export function cleanFollowupText(raw: string): string {
  return raw
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '')
    .replace(/\*+/g, '')
    .replace(/\s*—\s*/g, ', ')
    .trim()
}

/** Mensagens nossas enviadas depois da última mensagem do cliente. */
export function outboundSinceLastReply(
  rows: Array<{ sender_type: string; content_text: string | null }>,
): string[] {
  const out: string[] = []
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r.sender_type === 'customer') break
    if (r.content_text?.trim()) out.unshift(r.content_text.trim())
  }
  return out
}
