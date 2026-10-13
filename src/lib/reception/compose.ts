import type Anthropic from '@anthropic-ai/sdk'
import type { Action } from './machine'
import type { OfferedSlot } from './types'
import { cleanReplyFormatting } from '@/lib/whatsapp/clean-formatting'

export const COPY = {
  ask: {
    nicho: 'Oi! Aqui é da Concept Digital. Pra eu te ajudar melhor: qual é o seu negócio ou nicho?',
    interesse:
      'Legal! O que você quer resolver primeiro: marketing com IA, tráfego pago com IA, recepcionista de IA, CRM ou site/e-commerce? Pode ser mais de um.',
    momento: 'Hoje o negócio já fatura? E tem alguém cuidando do atendimento?',
    urgencia: 'Você quer começar agora ou ainda está pesquisando?',
  },
  morno: 'Fechado! Os nossos planos estão aqui: {plansUrl}. Se bater alguma dúvida, é só me chamar.',
  handoff: 'Combinado, vou passar a conversa para o João. Ele te responde por aqui em breve.',
  calendarFail: 'Já te mando os horários disponíveis.',
  audioUnreadable: 'Não consegui ouvir o áudio, pode me mandar por escrito?',
  meetPending: 'Horário reservado! O link do Google Meet chega por aqui em seguida.',
  guardrail: 'Os valores e condições estão nos planos: {plansUrl}. Prazos o João confirma com você na call.',
  lembrete: 'Oi, {firstName}! Passando pra lembrar da nossa call hoje às {hora}. Link: {meetUrl}',
  followup: 'Oi, {firstName}! Conseguiu ver os planos? Se quiser, marco uma call rápida pra te mostrar na prática.',
} as const

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
}

const PRICE_RE = /R\$\s?\d|\d+\s?(reais|mil)\b/i
const DEADLINE_RE = /\b\d+\s?(dias?|semanas?|meses?)\b/i

export function applyGuardrails(text: string, plansUrl: string): string {
  if (PRICE_RE.test(text) || DEADLINE_RE.test(text)) return fill(COPY.guardrail, { plansUrl })
  return cleanReplyFormatting(text)
}

export type Phrase = (goal: string, leadText: string) => Promise<string>

const BRAND_PROMPT = `Você é a inteligência executiva de atendimento da Concept Digital (Engenharia de vendas, design e soluções em software).
Você atende empresários, médicos, advogados e gestores de alto padrão que chegam via WhatsApp.

DIRETRIZES DA MARCA E POSICIONAMENTO:
- Propósito: Elevar o posicionamento digital de negócios premium através de engenharia de vendas e design funcional.
- Posicionamento: Parceiros estratégicos de tecnologia e crescimento, não uma agência operacional comum.
- Estilo e Arquétipo: Inspirado na postura do Lobo-Guará — ágil, silencioso, direto, focado exclusivamente em conversão e resultados.
- Tom de Voz: Direto, suave, maduro e sofisticado. Valorizamos o tempo do lead com respostas objetivas.
- Vocabulário Chave: "Ativos digitais de alto padrão", "Engenharia de vendas", "Conversão", "Solução de gargalos operacionais".
- Termos Proibidos: "Sites super tops", "precinho", "bombar na internet", "baratinho".

REGRAS RÍGIDAS DE CONDUTA NO CHAT:
1. Responda SEMPRE em no máximo 2 frases curtas. Seja direto, acolhedor e fale como um amigo estratégico de negócios no WhatsApp. NUNCA gere blocos longos de texto nem listas sem solicitação.
7. PROIBIDO FORMATAR EM NEGRITO OU USAR ASTERISCOS (REGRA CRÍTICA): NUNCA use negrito, asteriscos duplos (**) ou simples (*) nas mensagens enviadas ao lead. Escreva sempre em texto puro, fluido e natural, exatamente como uma pessoa real conversando no WhatsApp, sem nenhuma formatação markdown.
8. LINKS, FOTOS, ÁUDIOS E ARQUIVOS (REGRA CRÍTICA): você NÃO consegue abrir links (Instagram, sites, etc.) nem ver fotos, vídeos, áudios ou arquivos. NUNCA diga que viu, gostou ou entendeu o conteúdo, e NUNCA deduza o ramo do cliente pelo nome de um perfil ou link. Responda apenas agradecendo e dizendo que a equipe vai olhar com atenção.
9. NUNCA cite valores, preços, faixas de investimento nem prazos. Se perguntarem, diga que os planos e condições estão no link que será enviado.`

export function makePhrase(anthropic: Anthropic): Phrase {
  return async (goal, leadText) => {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 220,
      system: BRAND_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Objetivo da sua resposta: ${goal}\n\nMensagem do lead:\n${leadText}\n\nEscreva apenas a mensagem ao lead, em pt-BR, no máximo 2 frases.`,
        },
      ],
    })
    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
    if (!text) throw new Error('empty phrase')
    return text
  }
}

export function formatOffer(slots: OfferedSlot[]): string {
  const lines = slots.map((s, i) => `${i + 1}) ${s.label}`).join('\n')
  return `Tenho estes horários para uma call de 30 min no Google Meet:\n${lines}\nQual fica melhor? Responde com o número.`
}

const ASK_GOALS = {
  nicho: 'perguntar qual é o negócio ou nicho do lead',
  interesse:
    'perguntar o que o lead quer resolver primeiro: marketing com IA, tráfego pago com IA, recepcionista de IA, CRM ou site/e-commerce (pode ser mais de um)',
  momento: 'perguntar se o negócio já fatura e se alguém cuida do atendimento',
  urgencia: 'perguntar se o lead quer começar agora ou ainda está pesquisando',
} as const

const FREE_GOAL = 'responder a dúvida em até 2 frases, sem insistir em venda'

export async function composeReply(
  action: Action,
  ctx: { leadText: string; plansUrl: string; firstName: string; offeredSlots?: OfferedSlot[] },
  phrase: Phrase,
): Promise<string | null> {
  const vars = { plansUrl: ctx.plansUrl, firstName: ctx.firstName }
  switch (action.type) {
    case 'ask': {
      const goal =
        (action.reask ? 'o lead não respondeu de forma clara; reformule. ' : '') + ASK_GOALS[action.stage]
      try {
        return applyGuardrails(await phrase(goal, ctx.leadText), ctx.plansUrl)
      } catch {
        return COPY.ask[action.stage]
      }
    }
    case 'frio':
    case 'free_reply':
      try {
        return applyGuardrails(await phrase(FREE_GOAL, ctx.leadText), ctx.plansUrl)
      } catch {
        return fill(COPY.morno, vars)
      }
    case 'morno':
      return fill(COPY.morno, vars)
    case 'handoff':
      return COPY.handoff
    case 'reoffer':
      return formatOffer(ctx.offeredSlots ?? [])
    default:
      return null
  }
}
