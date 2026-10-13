import type { SupabaseClient } from '@supabase/supabase-js'

import { COPY, fill } from './compose'
import { addNote } from './crm'

/* eslint-disable @typescript-eslint/no-explicit-any */

const BATCH = 20
const MAX_ATTEMPTS = 3
const RETRY_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const HEALTH_REALERT_MS = 60 * 60 * 1000

export interface JobDeps {
  send: (phone: string, text: string) => Promise<unknown>
  notify: (text: string) => Promise<void>
  /** Restringe a fila a uma conta (multi-conta / deploy escopado). */
  accountId?: string
}

/** Hora cheia ou com minutos no fuso de SP: `10h`, `10h30`. */
export function formatHora(iso: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const h = String(Number(parts.find((p) => p.type === 'hour')?.value ?? '0'))
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return m === '00' ? `${h}h` : `${h}h${m}`
}

function firstNameOf(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n || n.toLowerCase() === 'novo lead') return ''
  return n.split(/\s+/)[0]
}

/** Sem nome, "Oi, !" vira "Oi!". */
function tidy(text: string): string {
  return text.replace(/^Oi, !/, 'Oi!')
}

function safeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/\d{8,}/g, '***').slice(0, 300)
}

async function must<T>(op: string, p: PromiseLike<{ data: T; error: { message?: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`[reception/jobs] ${op}: ${error.message ?? 'erro'}`)
  return data
}

async function recordBotMessage(db: SupabaseClient, conversationId: string | null, text: string, now: Date) {
  if (!conversationId) return
  await db.from('messages').insert({
    conversation_id: conversationId,
    content_text: text,
    content_type: 'text',
    sender_type: 'bot',
    status: 'sent',
  })
  await db
    .from('conversations')
    .update({ last_message_text: text, last_message_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', conversationId)
}

async function getContact(db: SupabaseClient, contactId: string) {
  const c = await must(
    'contact',
    db.from('contacts').select('name, phone, user_id').eq('id', contactId).maybeSingle() as any,
  )
  if (!c) throw new Error('contato não encontrado')
  return c as { name: string | null; phone: string | null; user_id: string }
}

async function runLembrete(db: SupabaseClient, job: any, now: Date, deps: JobDeps): Promise<void> {
  if (!job.appointment_id) return
  const appt: any = await must(
    'appointment',
    db.from('appointments').select('id, status, scheduled_at, meeting_url, contact_id').eq('id', job.appointment_id).maybeSingle() as any,
  )
  if (!appt || appt.status !== 'confirmed') return
  if (!appt.meeting_url) throw new Error('appointment sem meeting_url')
  const contact = await getContact(db, appt.contact_id)
  if (!contact.phone) throw new Error('contato sem telefone')
  const text = tidy(
    fill(COPY.lembrete, {
      firstName: firstNameOf(contact.name),
      hora: formatHora(appt.scheduled_at),
      meetUrl: appt.meeting_url,
    }),
  )
  await deps.send(contact.phone, text)
  const session: any = await must(
    'session',
    db.from('reception_sessions').select('conversation_id').eq('appointment_id', appt.id).maybeSingle() as any,
  )
  await recordBotMessage(db, session?.conversation_id ?? null, text, now)
}

async function runFollowup(db: SupabaseClient, job: any, now: Date, deps: JobDeps): Promise<void> {
  if (!job.session_id) return
  const s: any = await must(
    'session',
    db
      .from('reception_sessions')
      .select('id, account_id, stage, outcome, appointment_id, contact_id, conversation_id')
      .eq('id', job.session_id)
      .maybeSingle() as any,
  )
  if (!s || s.stage !== 'concluida' || s.outcome !== 'morno' || s.appointment_id) return

  const contact = await getContact(db, s.contact_id)
  const last: any = await must(
    'last message',
    db
      .from('messages')
      .select('created_at')
      .eq('conversation_id', s.conversation_id)
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as any,
  )
  const inWindow = !!last?.created_at && new Date(last.created_at).getTime() >= now.getTime() - DAY_MS

  if (!inWindow) {
    await addNote(db, {
      accountId: s.account_id,
      contactId: s.contact_id,
      userId: contact.user_id,
      text: 'Follow-up de morno pendente: chamar pelo WhatsApp oficial ou e-mail',
    })
    await deps.notify(`Follow-up de morno pendente (fora da janela de 24h): chamar pelo WhatsApp oficial ou e-mail. Contato ${s.contact_id}`)
    return
  }
  if (!contact.phone) throw new Error('contato sem telefone')
  const text = tidy(fill(COPY.followup, { firstName: firstNameOf(contact.name) }))
  await deps.send(contact.phone, text)
  await recordBotMessage(db, s.conversation_id, text, now)
}

export async function drainReceptionJobs(
  db: SupabaseClient,
  now: Date,
  deps: JobDeps,
): Promise<{ done: number; failed: number }> {
  let q = db
    .from('reception_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', now.toISOString())
  if (deps.accountId) q = q.eq('account_id', deps.accountId)
  const { data: due, error } = await q.order('run_at', { ascending: true }).limit(BATCH)
  if (error) throw new Error(`[reception/jobs] listar: ${error.message}`)

  let done = 0
  let failed = 0
  for (const row of (due ?? []) as any[]) {
    const { data: claimed } = await db
      .from('reception_jobs')
      .update({ status: 'running' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
    if (!claimed || claimed.length === 0) continue

    try {
      if (row.kind === 'lembrete') await runLembrete(db, row, now, deps)
      else if (row.kind === 'followup') await runFollowup(db, row, now, deps)
      await db.from('reception_jobs').update({ status: 'done', error: null }).eq('id', row.id)
      done++
    } catch (err) {
      const attempts = (row.attempts ?? 0) + 1
      const message = safeError(err)
      console.warn(`[reception/jobs] job ${row.id} (${row.kind}) falhou (${attempts}/${MAX_ATTEMPTS}): ${message}`)
      if (attempts < MAX_ATTEMPTS) {
        await db
          .from('reception_jobs')
          .update({
            status: 'pending',
            attempts,
            error: message,
            run_at: new Date(new Date(row.run_at).getTime() + RETRY_MS).toISOString(),
          })
          .eq('id', row.id)
      } else {
        await db.from('reception_jobs').update({ status: 'failed', attempts, error: message }).eq('id', row.id)
        failed++
        await deps.notify(`Job de recepção (${row.kind}) falhou ${MAX_ATTEMPTS}x: ${message}`)
      }
    }
  }
  return { done, failed }
}

export async function checkEvolutionHealth(
  db: SupabaseClient,
  accountId: string,
  now: Date,
  deps: { fetchImpl?: typeof fetch; notify: (text: string) => Promise<void> },
): Promise<'open' | 'down'> {
  const url = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-0d4c.up.railway.app'
  const instance = process.env.EVOLUTION_INSTANCE_NAME || 'concept-atendimento'
  const key = process.env.EVOLUTION_API_KEY ?? ''
  const f = deps.fetchImpl ?? fetch

  let state: 'open' | 'down' = 'down'
  try {
    const res = await f(`${url}/instance/connectionState/${instance}`, { headers: { apikey: key } })
    if (res.ok) {
      const body = (await res.json()) as { instance?: { state?: string } }
      if (body?.instance?.state === 'open') state = 'open'
    }
  } catch {
    state = 'down'
  }
  if (state === 'open') return 'open'

  const { data } = await db
    .from('reception_settings')
    .select('last_health_alert_at')
    .eq('account_id', accountId)
    .maybeSingle()
  const last = (data as any)?.last_health_alert_at as string | null | undefined
  if (!last || now.getTime() - new Date(last).getTime() > HEALTH_REALERT_MS) {
    await deps.notify('Evolution API desconectada: o WhatsApp da recepcionista pode estar fora do ar.')
    await db
      .from('reception_settings')
      .update({ last_health_alert_at: now.toISOString() })
      .eq('account_id', accountId)
  }
  return 'down'
}
