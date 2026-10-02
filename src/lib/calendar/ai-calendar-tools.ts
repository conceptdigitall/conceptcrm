import { supabaseAdmin } from '@/lib/ai/admin-client';
import { getCalendarAvailability, createCalendarEvent } from './google';
import { formatSlotsForWhatsApp, pickSuggestedSlots, type BusyInterval } from './rules';

export interface CheckAvailabilityParams {
  date: string; // YYYY-MM-DD
  timePreference?: 'manha' | 'tarde' | 'qualquer' | string | null;
  durationMinutes?: number | null;
  accountId?: string | null;
}

export interface CheckAvailabilityResult {
  success: boolean;
  isWorkingDay: boolean;
  availableSlots: string[];
  suggestedSlots: string[];
  formattedWhatsApp: string;
  replyText: string;
}

/**
 * Executa a ferramenta de consulta de disponibilidade pela IA.
 */
export async function executeCheckAvailability(
  params: CheckAvailabilityParams
): Promise<CheckAvailabilityResult> {
  const { date, timePreference = 'qualquer', durationMinutes = 30, accountId } = params;

  const targetDate = new Date(`${date}T00:00:00-03:00`);
  if (isNaN(targetDate.getTime())) {
    return {
      success: false,
      isWorkingDay: false,
      availableSlots: [],
      suggestedSlots: [],
      formattedWhatsApp: '',
      replyText: 'A data informada não é válida. Poderia me confirmar o dia certinho?',
    };
  }

  // 1. Busca compromissos confirmados no Supabase
  const busyIntervals: BusyInterval[] = [];
  try {
    const db = supabaseAdmin();
    const dayStart = new Date(`${date}T00:00:00-03:00`);
    const dayEnd = new Date(`${date}T23:59:59-03:00`);

    let query = db
      .from('appointments')
      .select('scheduled_at, duration_minutes, status')
      .eq('status', 'confirmed')
      .gte('scheduled_at', dayStart.toISOString())
      .lte('scheduled_at', dayEnd.toISOString());

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data: existingAppts } = await query;
    if (existingAppts && existingAppts.length > 0) {
      for (const a of existingAppts) {
        const start = new Date(a.scheduled_at);
        const duration = a.duration_minutes || 30;
        const end = new Date(start.getTime() + duration * 60 * 1000);
        busyIntervals.push({ start, end });
      }
    }
  } catch (err) {
    console.warn('[AI Calendar] Aviso ao buscar agendamentos do Supabase:', err);
  }

  // 2. Consulta agenda unificada (Google Calendar / iCal + Supabase)
  const availability = await getCalendarAvailability({
    targetDate,
    durationMinutes: durationMinutes || 30,
    existingBusyIntervals: busyIntervals,
  });

  if (!availability.isWorkingDay) {
    return {
      success: true,
      isWorkingDay: false,
      availableSlots: [],
      suggestedSlots: [],
      formattedWhatsApp: 'não atendemos aos domingos',
      replyText: 'Aos domingos nossa equipe não realiza agendamentos. Que tal marcarmos na segunda-feira ou outro dia da semana?',
    };
  }

  let slotTimes = availability.availableSlots.map((s) => s.time);
  const pref = (timePreference || 'qualquer').toLowerCase();

  // Filtra por preferência de turno
  if (pref.includes('manh') || pref === 'manha') {
    const morningSlots = slotTimes.filter((t) => Number(t.split(':')[0]) < 12);
    if (morningSlots.length > 0) {
      slotTimes = morningSlots;
    }
  } else if (pref.includes('tard') || pref === 'tarde') {
    const afternoonSlots = slotTimes.filter((t) => Number(t.split(':')[0]) >= 13);
    if (afternoonSlots.length > 0) {
      slotTimes = afternoonSlots;
    }
  }

  const suggested = pickSuggestedSlots(slotTimes, 3);
  const formatted = formatSlotsForWhatsApp(suggested);

  let replyText = '';
  if (suggested.length === 0) {
    replyText = 'Para essa data todos os nossos horários já estão preenchidos. Teria outro dia de sua preferência para alinharmos?';
  } else {
    replyText = `Consultei a nossa agenda aqui: temos horários livres ${formatted}. Qual desses fica melhor para você?`;
  }

  return {
    success: true,
    isWorkingDay: true,
    availableSlots: slotTimes,
    suggestedSlots: suggested,
    formattedWhatsApp: formatted,
    replyText,
  };
}

export interface ScheduleAppointmentToolParams {
  datetimeIso: string;
  title?: string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  clientEmail?: string | null;
  notes?: string | null;
  senderPhone?: string | null;
  contactId?: string | null;
  accountId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  sendEvolutionMessage?: (toPhone: string, text: string) => Promise<unknown>;
}

export interface ScheduleAppointmentToolResult {
  success: boolean;
  appointmentId?: string;
  meetUrl: string;
  calendarUrl: string;
  replyMessage: string;
}

/**
 * Executa a ferramenta de agendamento acionada pelo Claude.
 */
export async function executeScheduleAppointment(
  params: ScheduleAppointmentToolParams
): Promise<ScheduleAppointmentToolResult> {
  const {
    datetimeIso,
    title,
    clientName = 'Cliente',
    clientCompany,
    clientEmail,
    notes,
    senderPhone,
    contactId,
    accountId,
    userId,
    sendEvolutionMessage,
  } = params;

  const validDate = new Date(datetimeIso);
  const resolvedClientName = (clientName || '').trim() || 'Cliente';

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(validDate);

  // 1. Criação no Google Calendar / link universal
  const resolvedTitle = title || `Sessão de Diagnóstico & Demonstração - ${resolvedClientName}`;
  const gcalResult = await createCalendarEvent({
    title: resolvedTitle,
    startDate: validDate,
    durationMinutes: 30,
    clientName: resolvedClientName,
    clientEmail: clientEmail || undefined,
    clientPhone: senderPhone || undefined,
    company: clientCompany || undefined,
    notes: notes || undefined,
  });

  const db = supabaseAdmin();

  // 2. Atualiza contato no Supabase
  if (contactId) {
    try {
      const contactUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (resolvedClientName && resolvedClientName !== 'Cliente') {
        contactUpdates.name = resolvedClientName;
      }
      if (clientCompany?.trim()) {
        contactUpdates.company = clientCompany.trim();
      }
      if (clientEmail?.trim()) {
        contactUpdates.email = clientEmail.trim();
      }
      await db.from('contacts').update(contactUpdates).eq('id', contactId);

      // Inserir anotação no histórico
      if (userId && (notes || clientCompany || clientEmail)) {
        const noteLines = [
          `📅 Reunião agendada: ${formattedDate}`,
          clientCompany ? `🏢 Empresa/Nicho: ${clientCompany}` : null,
          clientEmail ? `✉️ E-mail: ${clientEmail}` : null,
          notes ? `📝 Dores/Escopo: ${notes}` : null,
          `🔗 Google Meet: ${gcalResult.meetUrl}`,
        ]
          .filter(Boolean)
          .join('\n');

        await db.from('contact_notes').insert({
          contact_id: contactId,
          user_id: userId,
          note_text: noteLines,
        });
      }
    } catch (cErr) {
      console.warn('[AI Calendar] Aviso ao atualizar dados do contato:', cErr);
    }
  }

  // 3. Grava agendamento na tabela appointments
  let createdId: string | undefined;
  try {
    const appointmentPayload: Record<string, unknown> = {
      title: resolvedTitle,
      scheduled_at: validDate.toISOString(),
      duration_minutes: 30,
      status: 'confirmed',
      meeting_url: gcalResult.meetUrl,
      notes: notes || null,
      google_event_id: gcalResult.eventId,
      synced_at: new Date().toISOString(),
    };
    if (contactId) appointmentPayload.contact_id = contactId;
    if (accountId) appointmentPayload.account_id = accountId;
    if (userId) appointmentPayload.user_id = userId;

    const { data: createdAppt, error: insErr } = await db
      .from('appointments')
      .insert(appointmentPayload)
      .select('id')
      .single();

    if (!insErr && createdAppt) {
      createdId = createdAppt.id;
    }
  } catch (apptErr) {
    console.warn('[AI Calendar] Aviso ao gravar appointment:', apptErr);
  }

  // 4. Notifica sócios no WhatsApp
  if (sendEvolutionMessage) {
    const defaultNumbers = ['5513978071057', '5513982292700'];
    const customList = process.env.ADMIN_WHATSAPP_NUMBERS
      ? process.env.ADMIN_WHATSAPP_NUMBERS.split(',').map((n) => n.trim().replace(/\D/g, '')).filter(Boolean)
      : [];
    const combined = Array.from(new Set([...defaultNumbers, ...customList])).map((n) =>
      n.length >= 10 && n.length <= 11 && !n.startsWith('55') ? '55' + n : n
    );

    const clientPhoneDisplay = senderPhone ? `+${senderPhone}` : 'Não informado';
    const adminNotificationMessage =
      `🚀 *NOVA REUNIÃO AGENDADA PELA IA!* 🎯\n\n` +
      `👤 *Cliente:* ${resolvedClientName}\n` +
      `📱 *WhatsApp:* ${clientPhoneDisplay}\n` +
      (clientCompany ? `🏢 *Empresa:* ${clientCompany}\n` : '') +
      (clientEmail ? `✉️ *E-mail:* ${clientEmail}\n` : '') +
      `📅 *Data & Hora:* ${formattedDate}\n` +
      `🔗 *Link do Google Meet:* ${gcalResult.meetUrl}\n` +
      (notes ? `📝 *Contexto/Diagnóstico:* ${notes}\n` : '') +
      `\n📆 *Adicionar ao Google Calendar:*\n${gcalResult.calendarUrl}\n\n` +
      `_Sincronizado automaticamente no CRM Concept Digital_`;

    for (const num of combined) {
      sendEvolutionMessage(num, adminNotificationMessage).catch((err) =>
        console.warn(`[AI Calendar] Falha ao notificar sócio ${num}:`, err)
      );
    }
  }

  // 5. Mensagem amigável de confirmação para o lead (sem markdown/asteriscos)
  const replyMessage =
    `Perfeito, ${resolvedClientName}! Agendado para ${formattedDate}.\n\n` +
    `Aqui está o link da nossa chamada no Google Meet: ${gcalResult.meetUrl}\n\n` +
    `Se quiser adicionar direto na sua agenda: ${gcalResult.calendarUrl}\n\n` +
    `Qualquer dúvida antes da reunião, estou por aqui!`;

  return {
    success: true,
    appointmentId: createdId,
    meetUrl: gcalResult.meetUrl,
    calendarUrl: gcalResult.calendarUrl,
    replyMessage,
  };
}
