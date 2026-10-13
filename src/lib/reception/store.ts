import type { SupabaseClient } from '@supabase/supabase-js'

import type { JobKind, ReceptionSession, ReceptionSettings, ReceptionStage } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSession(r: any): ReceptionSession {
  return {
    id: r.id,
    accountId: r.account_id,
    contactId: r.contact_id,
    conversationId: r.conversation_id,
    dealId: r.deal_id ?? null,
    stage: r.stage,
    answers: r.answers ?? {},
    unclearCount: r.unclear_count ?? 0,
    outcome: r.outcome ?? null,
    score: r.score ?? null,
    origin: r.origin ?? 'direto',
    offeredSlots: r.offered_slots ?? [],
    slotRounds: r.slot_rounds ?? 0,
    appointmentId: r.appointment_id ?? null,
  }
}

const STAGE_KEYS = ['novo', 'agendado', 'morno', 'curioso', 'humano'] as const

/** Returns null when the row is missing OR not fully configured. */
export async function loadSettings(db: SupabaseClient, accountId: string): Promise<ReceptionSettings | null> {
  const { data, error } = await db.from('reception_settings').select('*').eq('account_id', accountId).maybeSingle()
  if (error) throw new Error(`[reception/store] loadSettings: ${error.message}`)
  if (!data) return null
  const ids = (data.stage_ids ?? {}) as Record<string, string | undefined>
  const missing = STAGE_KEYS.filter((k) => !ids[k])
  if (!data.pipeline_id || missing.length > 0 || !String(data.plans_url ?? '').trim()) {
    console.warn(`[reception/store] reception_settings incompleto para a conta ${accountId}; recepcionista desligada`)
    return null
  }
  return {
    accountId: data.account_id,
    enabled: !!data.enabled,
    pipelineId: data.pipeline_id,
    stageIds: {
      novo: ids.novo!,
      agendado: ids.agendado!,
      morno: ids.morno!,
      curioso: ids.curioso!,
      humano: ids.humano!,
    },
    plansUrl: data.plans_url,
    lastHealthAlertAt: data.last_health_alert_at ?? null,
  }
}

export async function loadSession(db: SupabaseClient, conversationId: string): Promise<ReceptionSession | null> {
  const { data, error } = await db.from('reception_sessions').select('*').eq('conversation_id', conversationId).maybeSingle()
  if (error) throw new Error(`[reception/store] loadSession: ${error.message}`)
  return data ? toSession(data) : null
}

export async function createSession(
  db: SupabaseClient,
  input: { accountId: string; contactId: string; conversationId: string; dealId: string | null; origin: string },
): Promise<ReceptionSession> {
  const { data, error } = await db
    .from('reception_sessions')
    .insert({
      account_id: input.accountId,
      contact_id: input.contactId,
      conversation_id: input.conversationId,
      deal_id: input.dealId,
      origin: input.origin,
      stage: 'nicho',
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`[reception/store] createSession: ${error?.message ?? 'sem retorno'}`)
  return toSession(data)
}

/** Records the deal on the session without touching anything else (the stage may already have moved on). */
export async function setSessionDeal(db: SupabaseClient, sessionId: string, dealId: string): Promise<void> {
  const { error } = await db.from('reception_sessions').update({ deal_id: dealId }).eq('id', sessionId)
  if (error) throw new Error(`[reception/store] setSessionDeal: ${error.message}`)
}

/** Optimistic save: only applies if the stored stage is still `prevStage`. False = lost the race. */
export async function saveSession(
  db: SupabaseClient,
  next: ReceptionSession,
  prevStage: ReceptionStage,
): Promise<boolean> {
  const { data, error } = await db
    .from('reception_sessions')
    .update({
      deal_id: next.dealId,
      stage: next.stage,
      answers: next.answers,
      unclear_count: next.unclearCount,
      outcome: next.outcome,
      score: next.score,
      origin: next.origin,
      offered_slots: next.offeredSlots,
      slot_rounds: next.slotRounds,
      appointment_id: next.appointmentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', next.id)
    .eq('stage', prevStage)
    .select('id')
  if (error) throw new Error(`[reception/store] saveSession: ${error.message}`)
  return Array.isArray(data) && data.length > 0
}

export async function enqueueJob(
  db: SupabaseClient,
  j: { accountId: string; kind: JobKind; runAt: Date; sessionId?: string; appointmentId?: string },
): Promise<void> {
  const { error } = await db.from('reception_jobs').insert({
    account_id: j.accountId,
    kind: j.kind,
    run_at: j.runAt.toISOString(),
    session_id: j.sessionId ?? null,
    appointment_id: j.appointmentId ?? null,
  })
  if (error) throw new Error(`[reception/store] enqueueJob: ${error.message}`)
}
