export type ReceptionStage =
  | 'nicho'
  | 'interesse'
  | 'momento'
  | 'urgencia'
  | 'agendando'
  | 'concluida'
  | 'humano'

export type Outcome = 'quente' | 'morno' | 'frio' | 'humano'

export type Interest =
  | 'marketing_ia'
  | 'trafego_ia'
  | 'recepcionista_ia'
  | 'crm'
  | 'site_ecommerce'

export interface Answers {
  nicho?: string
  interesses?: Interest[]
  fatura?: boolean
  temTime?: boolean
  urgencia?: 'agora' | 'pesquisando'
}

export interface OfferedSlot {
  iso: string
  label: string
}

export interface ReceptionSession {
  id: string
  accountId: string
  contactId: string
  conversationId: string
  dealId: string | null
  stage: ReceptionStage
  answers: Answers
  unclearCount: number
  outcome: Outcome | null
  score: number | null
  origin: string
  offeredSlots: OfferedSlot[]
  slotRounds: number
  appointmentId: string | null
}

export interface ReceptionSettings {
  accountId: string
  enabled: boolean
  pipelineId: string
  stageIds: {
    novo: string
    agendado: string
    morno: string
    curioso: string
    humano: string
  }
  plansUrl: string
  lastHealthAlertAt: string | null
}

export type JobKind = 'lembrete' | 'followup'
