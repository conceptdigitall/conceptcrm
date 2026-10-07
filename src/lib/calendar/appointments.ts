// ============================================================
// Agendamentos — núcleo compartilhado entre o painel
// (`/api/calendar/*`, sessão de cookie) e a API pública
// (`/api/v1/appointments`, chave de API).
//
// Recebe um client service-role: TODA consulta é filtrada por
// `accountId` aqui dentro, porque RLS não protege esse client.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { createCalendarEvent } from '@/lib/calendar/google';
import { isWorkingDay, type BusyInterval } from '@/lib/calendar/rules';

export const APPOINTMENT_STATUSES = ['confirmed', 'cancelled', 'completed'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export class AppointmentError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export interface CreateAppointmentInput {
  contact_id?: string | null;
  title?: string | null;
  scheduled_at?: string | null;
  duration_minutes?: number | string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  company?: string | null;
  notes?: string | null;
}

export function clampDuration(raw: unknown): number {
  return Math.max(15, Math.min(120, Number(raw) || 30));
}

/** Valida a data ISO e a regra de dia útil. Lança AppointmentError 400. */
export function parseScheduledAt(raw: unknown): Date {
  if (typeof raw !== 'string' || !raw) {
    throw new AppointmentError('Campo "scheduled_at" é obrigatório no formato ISO', 400);
  }
  const date = new Date(raw);
  if (isNaN(date.getTime())) {
    throw new AppointmentError('Data de agendamento inválida', 400);
  }
  if (!isWorkingDay(date)) {
    throw new AppointmentError(
      'Não realizamos agendamentos aos domingos. Escolha de segunda a sábado.',
      400
    );
  }
  return date;
}

async function assertContactInAccount(
  db: SupabaseClient,
  accountId: string,
  contactId: string
): Promise<void> {
  const { data } = await db
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!data) throw new AppointmentError('Contato não encontrado', 404);
}

export interface CreateAppointmentResult {
  appointment: Record<string, unknown>;
  meetUrl: string;
  calendarUrl: string;
  eventId: string;
}

export async function createAppointment(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  input: CreateAppointmentInput
): Promise<CreateAppointmentResult> {
  const scheduledDate = parseScheduledAt(input.scheduled_at);
  const contactId = input.contact_id || null;
  if (contactId) await assertContactInAccount(db, accountId, contactId);

  const duration = clampDuration(input.duration_minutes);
  const clientName = input.client_name || undefined;
  const resolvedTitle =
    input.title || `Sessão de Diagnóstico & Demonstração${clientName ? ` - ${clientName}` : ''}`;

  // Criação no Google Calendar / link universal
  const calendarResult = await createCalendarEvent({
    title: resolvedTitle,
    startDate: scheduledDate,
    durationMinutes: duration,
    clientName,
    clientEmail: input.client_email || undefined,
    clientPhone: input.client_phone || undefined,
    company: input.company || undefined,
    notes: input.notes || undefined,
  });

  const payload: Record<string, unknown> = {
    account_id: accountId,
    user_id: userId,
    title: resolvedTitle,
    scheduled_at: scheduledDate.toISOString(),
    duration_minutes: duration,
    status: 'confirmed',
    meeting_url: calendarResult.meetUrl,
    notes: input.notes || null,
    google_event_id: calendarResult.eventId,
    synced_at: new Date().toISOString(),
  };
  if (contactId) payload.contact_id = contactId;

  const { data: created, error } = await db
    .from('appointments')
    .insert(payload)
    .select('*')
    .single();

  if (error || !created) {
    console.error('[appointments] Erro ao gravar agendamento no banco:', error);
    throw new AppointmentError(`Erro ao gravar agendamento: ${error?.message ?? 'sem retorno'}`, 500);
  }

  // Se houver contato informado, atualiza os dados cadastrais
  if (contactId) {
    try {
      const contactUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.client_name?.trim()) contactUpdates.name = input.client_name.trim();
      if (input.client_email?.trim()) contactUpdates.email = input.client_email.trim();
      if (input.company?.trim()) contactUpdates.company = input.company.trim();

      await db
        .from('contacts')
        .update(contactUpdates)
        .eq('id', contactId)
        .eq('account_id', accountId);

      if (input.notes || input.company || input.client_email) {
        await db.from('contact_notes').insert({
          contact_id: contactId,
          user_id: userId,
          note_text: `📅 Reunião agendada via CRM: ${scheduledDate.toLocaleString('pt-BR')}\nGoogle Meet: ${calendarResult.meetUrl}`,
        });
      }
    } catch (contactErr) {
      console.warn('[appointments] Aviso ao atualizar dados do contato:', contactErr);
    }
  }

  return {
    appointment: created as Record<string, unknown>,
    meetUrl: calendarResult.meetUrl,
    calendarUrl: calendarResult.calendarUrl,
    eventId: calendarResult.eventId,
  };
}

/** Compromissos confirmados do dia (fuso de Brasília) como intervalos ocupados. */
export async function loadBusyIntervals(
  db: SupabaseClient,
  accountId: string,
  dateStr: string
): Promise<BusyInterval[]> {
  const dayStart = new Date(`${dateStr}T00:00:00-03:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59-03:00`);
  const { data } = await db
    .from('appointments')
    .select('scheduled_at, duration_minutes, status')
    .eq('status', 'confirmed')
    .eq('account_id', accountId)
    .gte('scheduled_at', dayStart.toISOString())
    .lte('scheduled_at', dayEnd.toISOString());

  return (data ?? []).map((appt) => {
    const start = new Date(appt.scheduled_at as string);
    const duration = (appt.duration_minutes as number) || 30;
    return { start, end: new Date(start.getTime() + duration * 60 * 1000) };
  });
}
