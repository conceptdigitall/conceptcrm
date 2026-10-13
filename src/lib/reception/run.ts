import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { AvailableSlot } from '@/lib/calendar/rules'
import { executeScheduleAppointment } from '@/lib/calendar/ai-calendar-tools'
import { layaBatch } from '@/lib/laya/client'
import { arbitrateWithClient } from '@/lib/laya/claude-arbitrator'

import { makeClassify, readAnswer, type Classify, type StageReading } from './classify'
import { COPY, composeReply, formatOffer, makePhrase, type Phrase } from './compose'
import { ensureDeal, moveDeal, pauseAi, tagContact } from './crm'
import { advance, type Action } from './machine'
import { maskPhone, notifyOps, parseOrigin } from './ops'
import { isSlotStillFree, makeLoadDay, pickOfferSlots } from './slots'
import { createSession, enqueueJob, loadSession, saveSession, setSessionDeal } from './store'
import type { Answers, OfferedSlot, ReceptionSession, ReceptionSettings } from './types'


const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export interface ReceptionInput {
  accountId: string
  userId: string
  contactId: string
  conversationId: string
  senderName: string
  senderPhone: string
  text: string
  settings: ReceptionSettings
  now?: Date
}

export interface ReceptionDeps {
  db: SupabaseClient
  classify: Classify
  phrase: Phrase
  loadDay: (dateStr: string) => Promise<AvailableSlot[]>
  schedule: typeof executeScheduleAppointment
  sendWhatsApp: (n: string, t: string) => Promise<unknown>
}

/** Real dependencies: Laya (when LAYA_URL is set) with Haiku fallback, Haiku phrasing, Google agenda. */
export function buildReceptionDeps(
  db: SupabaseClient,
  accountId: string,
  now: Date,
  sendWhatsApp: (n: string, t: string) => Promise<unknown>,
): ReceptionDeps {
  const layaUrl = process.env.LAYA_URL
  // Short timeout + 1 retry for every Haiku call: the webhook has 60 s in total.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 8000, maxRetries: 1 })
  const classify = makeClassify({
    ...(layaUrl
      ? {
          laya: async (text, question) =>
            (await layaBatch(layaUrl, [text], question, { timeoutMs: 2500, maxAttempts: 1 }))[0],
        }
      : {}),
    haiku: (text, question, options) => arbitrateWithClient(anthropic, text, question, options),
  })
  return {
    db,
    classify,
    phrase: makePhrase(anthropic),
    loadDay: makeLoadDay(db, accountId, now),
    schedule: executeScheduleAppointment,
    sendWhatsApp,
  }
}

function firstNameOf(senderName: string): string {
  const name = (senderName ?? '').trim()
  if (!name || name === 'Novo Lead') return ''
  return name.split(/\s+/)[0]
}

const INTEREST_LABEL: Record<string, string> = {
  marketing_ia: 'marketing com IA',
  trafego_ia: 'tráfego com IA',
  recepcionista_ia: 'recepcionista de IA',
  crm: 'CRM',
  site_ecommerce: 'site/e-commerce',
}

/** Short pt-BR summary of the answers (never the phone). */
export function summarizeAnswers(a: Answers): string {
  const parts: string[] = []
  if (a.nicho) parts.push(`nicho: ${a.nicho}`)
  if (a.interesses?.length) parts.push(`interesses: ${a.interesses.map((i) => INTEREST_LABEL[i] ?? i).join(', ')}`)
  if (a.fatura !== undefined) parts.push(`fatura: ${a.fatura ? 'sim' : 'não'}`)
  if (a.temTime !== undefined) parts.push(`time no atendimento: ${a.temTime ? 'sim' : 'não'}`)
  if (a.urgencia) parts.push(`urgência: ${a.urgencia}`)
  return parts.length ? `Recepcionista IA. ${parts.join('; ')}.` : 'Recepcionista IA. Sem respostas ainda.'
}

function shortError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 160)
}

interface Ctx {
  input: ReceptionInput
  deps: ReceptionDeps
  now: Date
  masked: string
  notify: (text: string) => Promise<void>
}

/** Post-save side effect: the session is already committed, so a failure here is reported, not fatal. */
async function bestEffort(ctx: Ctx, label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[reception/run] ${label} falhou (lead ${ctx.masked}):`, shortError(err))
    await ctx.notify(`Recepcionista: ${label} falhou para o lead ${ctx.masked}.`)
  }
}

/** Reply when Laya and Haiku are both down: the stage question again, fixed text, no state change. */
function fallbackReply(s: ReceptionSession): string | null {
  if (s.stage === 'agendando') return s.offeredSlots.length ? formatOffer(s.offeredSlots) : COPY.calendarFail
  if (s.stage === 'nicho' || s.stage === 'interesse' || s.stage === 'momento' || s.stage === 'urgencia') {
    return COPY.ask[s.stage]
  }
  return null
}

async function startSession(ctx: Ctx): Promise<string | null> {
  const { input, deps } = ctx
  // Session first: the UNIQUE(conversation_id) picks one winner in a burst of first messages,
  // and only the winner creates the deal (no duplicate deals).
  let session: ReceptionSession
  try {
    session = await createSession(deps.db, {
      accountId: input.accountId,
      contactId: input.contactId,
      conversationId: input.conversationId,
      dealId: null,
      origin: parseOrigin(input.text),
    })
  } catch (err) {
    // Two first messages at once: the other one created the session (unique conversation_id) and answers.
    if (await loadSession(deps.db, input.conversationId)) return null
    throw err
  }

  await bestEffort(ctx, 'criar deal', async () => {
    const dealId = await ensureDeal(deps.db, {
      accountId: input.accountId,
      userId: input.userId,
      contactId: input.contactId,
      conversationId: input.conversationId,
      settings: input.settings,
      title: input.senderName?.trim() || 'Novo Lead',
    })
    await setSessionDeal(deps.db, session.id, dealId)
    session = { ...session, dealId }
  })

  // The 1st message never counts as an answer nor as "unclear": only a request for a human matters.
  // `concluida` makes readAnswer ask the human question alone.
  let reading: StageReading = { kind: 'unclear' }
  try {
    reading = await readAnswer('concluida', input.text, session, deps.classify)
  } catch {
    // Laya and Haiku down: just greet and ask the niche.
  }
  if (reading.kind === 'humano') return handle(ctx, session, reading)

  return composeReply({ type: 'ask', stage: 'nicho', reask: false }, replyCtx(ctx, session), deps.phrase)
}

function replyCtx(ctx: Ctx, s: ReceptionSession) {
  return {
    leadText: ctx.input.text,
    plansUrl: ctx.input.settings.plansUrl,
    firstName: firstNameOf(ctx.input.senderName),
    offeredSlots: s.offeredSlots,
  }
}

async function slotStillBookable(ctx: Ctx, slot: OfferedSlot): Promise<boolean> {
  try {
    return await isSlotStillFree(ctx.now, ctx.deps.loadDay, slot.iso)
  } catch (err) {
    console.error(`[reception/run] conferir horário falhou (lead ${ctx.masked}):`, shortError(err))
    return false
  }
}

/** advance → (pre-save effects) → conditional save → post-save effects → reply. */
async function handle(ctx: Ctx, prev: ReceptionSession, reading: StageReading): Promise<string | null> {
  const { deps, now } = ctx
  let { session: advanced, action } = advance(prev, reading)
  if (action.type === 'silent') return null

  // A slot offered earlier may be in the past or taken by now: treat it as "none of these".
  if (action.type === 'book' && !(await slotStillBookable(ctx, action.slot))) {
    ;({ session: advanced, action } = advance(prev, { kind: 'slot_none' }))
  }

  let next: ReceptionSession = advanced
  let slotsFailed = false

  if (action.type === 'offer_slots') {
    let slots: OfferedSlot[] = []
    try {
      slots = await pickOfferSlots(now, deps.loadDay, prev.offeredSlots.map((s) => s.iso))
    } catch (err) {
      console.error(`[reception/run] pickOfferSlots falhou (lead ${ctx.masked}):`, shortError(err))
    }
    if (slots.length) next = { ...next, offeredSlots: slots }
    else {
      // No slot to offer (or the agenda failed): hand the lead over to João instead of an empty offer.
      slotsFailed = true
      next = { ...next, stage: 'humano', outcome: 'humano' }
    }
  }
  if (action.type === 'book') next = { ...next, stage: 'concluida' }

  // Optimistic save: losing the race to a concurrent message means that one answers, not this one.
  if (!(await saveSession(deps.db, next, prev.stage))) return null

  return effects(ctx, next, action, slotsFailed)
}

async function effects(
  ctx: Ctx,
  next: ReceptionSession,
  action: Action,
  slotsFailed: boolean,
): Promise<string | null> {
  const { input, deps, now } = ctx
  const { db } = deps
  const stageIds = input.settings.stageIds
  const dealId = next.dealId
  const move = (stageId: string, label: string) =>
    dealId ? bestEffort(ctx, label, () => moveDeal(db, dealId, stageId)) : Promise.resolve()

  switch (action.type) {
    case 'offer_slots':
      if (slotsFailed) {
        await move(stageIds.humano, 'mover deal para humano')
        await bestEffort(ctx, 'pausar a IA', () => pauseAi(db, input.conversationId, summarizeAnswers(next.answers)))
        await ctx.notify(`Recepcionista: sem horários ou agenda com falha para o lead ${ctx.masked}. Conversa passada para você.`)
        return COPY.calendarFail
      }
      return formatOffer(next.offeredSlots)

    case 'book':
      return book(ctx, next, action.slot)

    case 'morno':
      await move(stageIds.morno, 'mover deal para morno')
      await bestEffort(ctx, 'agendar follow-up', () =>
        enqueueJob(db, { accountId: input.accountId, kind: 'followup', runAt: new Date(now.getTime() + 3 * DAY_MS), sessionId: next.id }),
      )
      break

    case 'frio':
      await move(stageIds.curioso, 'mover deal para curioso')
      await bestEffort(ctx, 'marcar tag curioso', () =>
        tagContact(db, { accountId: input.accountId, userId: input.userId, contactId: input.contactId, tagName: 'curioso' }),
      )
      break

    case 'handoff':
      await move(stageIds.humano, 'mover deal para humano')
      await bestEffort(ctx, 'pausar a IA', () => pauseAi(db, input.conversationId, summarizeAnswers(next.answers)))
      await ctx.notify(`Lead ${ctx.masked} pediu humano`)
      break
  }

  return composeReply(action, replyCtx(ctx, next), deps.phrase)
}

async function book(ctx: Ctx, claimed: ReceptionSession, slot: OfferedSlot): Promise<string | null> {
  const { input, deps } = ctx
  const { db } = deps
  let result: Awaited<ReturnType<typeof executeScheduleAppointment>> | null = null
  try {
    result = await deps.schedule({
      datetimeIso: slot.iso,
      clientName: input.senderName,
      senderPhone: input.senderPhone,
      contactId: input.contactId,
      accountId: input.accountId,
      userId: input.userId,
      conversationId: input.conversationId,
      dealId: claimed.dealId,
      notes: summarizeAnswers(claimed.answers),
      sendEvolutionMessage: deps.sendWhatsApp,
    })
  } catch (err) {
    console.error(`[reception/run] agendamento falhou (lead ${ctx.masked}):`, shortError(err))
  }

  if (!result?.success) {
    // Give the slot choice back to the lead and let João know.
    await saveSession(db, { ...claimed, stage: 'agendando' }, 'concluida')
    await ctx.notify(`Recepcionista: falha ao agendar ${slot.label} para o lead ${ctx.masked}. Confira a agenda.`)
    return COPY.calendarFail
  }

  // The stage claim was the race guard; this second write only records the appointment.
  const appointmentId = result.appointmentId ?? null
  await bestEffort(ctx, 'gravar appointmentId', () => saveSession(db, { ...claimed, appointmentId }, 'concluida'))
  if (claimed.dealId) {
    const dealId = claimed.dealId
    await bestEffort(ctx, 'mover deal para agendado', () => moveDeal(db, dealId, input.settings.stageIds.agendado))
  }
  await bestEffort(ctx, 'agendar lembrete', () =>
    enqueueJob(db, {
      accountId: input.accountId,
      kind: 'lembrete',
      runAt: new Date(new Date(slot.iso).getTime() - HOUR_MS),
      sessionId: claimed.id,
      appointmentId: appointmentId ?? undefined,
    }),
  )

  if (!result.meetCreated) {
    await ctx.notify(`Recepcionista: reunião com o lead ${ctx.masked} em ${slot.label} ficou sem link do Meet. Envie o link manualmente.`)
    return COPY.meetPending
  }
  return result.replyMessage
}

/**
 * Only conversations that never had a non-customer message (bot or human agent) enter the triage;
 * older ones stay with the legacy robot. An existing session always continues. The "send it in writing"
 * audio reply does not count: it can be the very first bot message of a brand-new lead.
 */
export async function shouldStartReception(db: SupabaseClient, conversationId: string): Promise<boolean> {
  if (await loadSession(db, conversationId)) return true
  const { data, error } = await db
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .neq('sender_type', 'customer')
    .neq('content_text', COPY.audioUnreadable)
    .limit(1)
  if (error) throw new Error(`[reception/run] shouldStartReception: ${error.message}`)
  return !data || data.length === 0
}

/** Text to send to the lead, or null to stay quiet. Never throws. */
export async function runReception(input: ReceptionInput, deps: ReceptionDeps): Promise<string | null> {
  const masked = maskPhone(input.senderPhone)
  const ctx: Ctx = {
    input,
    deps,
    now: input.now ?? new Date(),
    masked,
    notify: (text) => notifyOps(text, { sendWhatsApp: deps.sendWhatsApp }),
  }
  try {
    const prev = await loadSession(deps.db, input.conversationId)
    if (!prev) return await startSession(ctx)
    if (prev.stage === 'humano') return null

    let reading: StageReading
    try {
      reading = await readAnswer(prev.stage, input.text, prev, deps.classify)
    } catch {
      // Laya and Haiku down: repeat the stage question; not counted as "unclear".
      return fallbackReply(prev)
    }
    return await handle(ctx, prev, reading)
  } catch (err) {
    console.error(`[reception/run] erro inesperado (lead ${masked}):`, shortError(err))
    await ctx.notify(`Recepcionista falhou para o lead ${masked}: ${shortError(err)}`)
    return null
  }
}
