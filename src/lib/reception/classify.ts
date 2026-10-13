import type { LayaAnswer, LayaQuestion } from '@/lib/prospecting/columns'
import type { Interest, ReceptionSession, ReceptionStage } from './types'

const MIN_CONFIDENCE = 0.7
const SIM_NAO = ['sim', 'não']

/** Devolve uma das `options` ou 'indefinido'. Lança só se Laya e Haiku falharem. */
export type Classify = (text: string, question: LayaQuestion, options: string[]) => Promise<string>

export interface ClassifyDeps {
  /** Ausente quando LAYA_URL não está configurada: vai direto ao Haiku. */
  laya?: (text: string, question: LayaQuestion) => Promise<LayaAnswer>
  haiku: (text: string, question: LayaQuestion, options: string[]) => Promise<string>
}

// Confident Laya reading, or null when the answer is not sure enough.
function fromLaya(answer: LayaAnswer, question: LayaQuestion, options: string[]): string | null {
  if (question.type === 'noul') {
    if (typeof answer.noul !== 'number') return null
    const yes = answer.noul >= 0.5
    return Math.max(answer.noul, 1 - answer.noul) >= MIN_CONFIDENCE ? (yes ? 'sim' : 'não') : null
  }
  let best: string | null = null
  let bestP = -1
  for (const [label, p] of Object.entries(answer.probabilities ?? {})) {
    if (options.includes(label) && p > bestP) { best = label; bestP = p }
  }
  return best !== null && bestP >= MIN_CONFIDENCE ? best : null
}

export function makeClassify(deps: ClassifyDeps): Classify {
  return async (text, question, options) => {
    if (deps.laya) {
      try {
        const sure = fromLaya(await deps.laya(text, question), question, options)
        if (sure !== null) return sure
      } catch {
        // Laya offline or slow: Haiku decides.
      }
    }
    const raw = await deps.haiku(text, question, [...options, 'indefinido'])
    return options.includes(raw) ? raw : 'indefinido'
  }
}

export type StageReading =
  | { kind: 'humano' }
  | { kind: 'unclear' }
  | { kind: 'nicho'; nicho: string }
  | { kind: 'interesse'; interesses: Interest[] }
  | { kind: 'momento'; fatura: boolean; temTime: boolean }
  | { kind: 'urgencia'; urgencia: 'agora' | 'pesquisando' }
  | { kind: 'slot'; index: number }
  | { kind: 'slot_none' }

const noul = (instructions: string): LayaQuestion => ({ type: 'noul', instructions })

const Q_HUMANO = noul('O lead está pedindo para falar com uma pessoa, humano ou atendente?')
const Q_FATURA = noul('O negócio do lead já fatura/vende?')
const Q_TIME = noul('O lead tem alguém ou time cuidando do atendimento?')

const INTEREST_QUESTIONS: [Interest, LayaQuestion][] = [
  ['marketing_ia', noul('O lead quer marketing com IA (conteúdo, posts, vídeos, anúncios criados com IA)?')],
  ['trafego_ia', noul('O lead quer tráfego pago ou gestão de anúncios com IA?')],
  ['recepcionista_ia', noul('O lead quer uma recepcionista ou atendimento automático com IA no WhatsApp?')],
  ['crm', noul('O lead quer um CRM ou organizar o funil de vendas e os contatos?')],
  ['site_ecommerce', noul('O lead quer um site ou uma loja virtual (e-commerce)?')],
]

const Q_URGENCIA: LayaQuestion = {
  type: 'choice',
  instructions: 'Qual a urgência do lead: quer começar agora ou está só pesquisando?',
  criteria: { agora: 'quer começar agora', pesquisando: 'está só pesquisando' },
}

export async function readAnswer(
  stage: ReceptionStage, text: string, session: ReceptionSession, classify: Classify,
): Promise<StageReading> {
  if ((await classify(text, Q_HUMANO, SIM_NAO)) === 'sim') return { kind: 'humano' }

  switch (stage) {
    case 'nicho': {
      const nicho = text.trim()
      return (nicho.match(/\p{L}/gu)?.length ?? 0) >= 3 ? { kind: 'nicho', nicho: nicho.slice(0, 120) } : { kind: 'unclear' }
    }
    case 'interesse': {
      const answers = await Promise.all(INTEREST_QUESTIONS.map(([, q]) => classify(text, q, SIM_NAO)))
      const interesses = INTEREST_QUESTIONS.filter((_, i) => answers[i] === 'sim').map(([k]) => k)
      return interesses.length ? { kind: 'interesse', interesses } : { kind: 'unclear' }
    }
    case 'momento': {
      const [fatura, time] = await Promise.all([classify(text, Q_FATURA, SIM_NAO), classify(text, Q_TIME, SIM_NAO)])
      if (fatura === 'indefinido') return { kind: 'unclear' }
      return { kind: 'momento', fatura: fatura === 'sim', temTime: time === 'sim' }
    }
    case 'urgencia': {
      const r = await classify(text, Q_URGENCIA, ['agora', 'pesquisando'])
      return r === 'agora' || r === 'pesquisando' ? { kind: 'urgencia', urgencia: r } : { kind: 'unclear' }
    }
    case 'agendando': {
      const digit = text.match(/^\s*([1-3])\b/)
      if (digit && Number(digit[1]) <= session.offeredSlots.length) return { kind: 'slot', index: Number(digit[1]) - 1 }
      const labels = session.offeredSlots.map((s) => s.label)
      const q: LayaQuestion = {
        type: 'choice',
        instructions: 'Qual horário da lista o lead escolheu? Se ele propôs outro horário ou recusou todos, responda nenhum.',
        criteria: Object.fromEntries([...labels, 'nenhum'].map((l) => [l, l])),
      }
      const r = await classify(text, q, [...labels, 'nenhum'])
      if (r === 'nenhum') return { kind: 'slot_none' }
      const index = labels.indexOf(r)
      return index >= 0 ? { kind: 'slot', index } : { kind: 'unclear' }
    }
    default:
      return { kind: 'unclear' }
  }
}
