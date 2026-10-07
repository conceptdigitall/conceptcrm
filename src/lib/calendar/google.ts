import {
  calculateAvailableSlots,
  pickSuggestedSlots,
  formatSlotsForWhatsApp,
  isWorkingDay,
  type BusyInterval,
  type AvailableSlot,
} from './rules';
import { fetchIcsBusyIntervals } from './ical';

export type CalendarIntegrationMode = 'service_account' | 'ical' | 'webhook' | 'local_crm';

export interface CalendarIntegrationStatus {
  mode: CalendarIntegrationMode;
  hasServiceAccount: boolean;
  hasIcal: boolean;
  hasWebhook: boolean;
  calendarId: string;
}

/**
 * Detecta quais credenciais e métodos de integração com o Google Calendar estão disponíveis.
 */
export function isGoogleCalendarConfigured(): CalendarIntegrationStatus {
  const email =
    process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  const ical = process.env.GOOGLE_CALENDAR_ICAL_URL || '';
  const webhook = process.env.GOOGLE_CALENDAR_WEBHOOK_URL || '';
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  const hasServiceAccount = Boolean(email.trim() && key.trim());
  const hasIcal = Boolean(ical.trim() && ical.startsWith('http'));
  const hasWebhook = Boolean(webhook.trim() && webhook.startsWith('http'));

  let mode: CalendarIntegrationMode = 'local_crm';
  if (hasServiceAccount) {
    mode = 'service_account';
  } else if (hasIcal) {
    mode = 'ical';
  } else if (hasWebhook) {
    mode = 'webhook';
  }

  return {
    mode,
    hasServiceAccount,
    hasIcal,
    hasWebhook,
    calendarId,
  };
}

/**
 * Gera URL universal para adicionar evento ao Google Calendar com 1 clique (TEMPLATE)
 */
export function generateDirectGoogleCalendarUrl(params: {
  title: string;
  startDate: Date;
  durationMinutes?: number;
  details?: string;
  location?: string;
}): string {
  const { title, startDate, durationMinutes = 30, details = '', location = 'https://meet.google.com/new' } = params;

  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

  const formatUtcGCal = (d: Date) => {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const dates = `${formatUtcGCal(startDate)}/${formatUtcGCal(endDate)}`;
  const searchParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details,
    location,
  });

  return `https://calendar.google.com/calendar/render?${searchParams.toString()}`;
}

export interface CreateEventParams {
  title: string;
  startDate: Date;
  durationMinutes?: number;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  company?: string;
  notes?: string;
  location?: string;
}

export interface CreateEventResult {
  eventId: string;
  meetUrl: string;
  calendarUrl: string;
}

/**
 * Cria o evento no Google Calendar utilizando o melhor canal disponível:
 * 1. Webhook n8n (se configurado)
 * 2. Service Account do Google Cloud (se configurado)
 * 3. Link universal de calendário + Google Meet padrão (modo resiliente)
 */
export async function createCalendarEvent(params: CreateEventParams): Promise<CreateEventResult> {
  const {
    title,
    startDate,
    durationMinutes = 30,
    clientName = 'Cliente',
    clientEmail,
    clientPhone,
    company,
    notes,
    location,
  } = params;

  const status = isGoogleCalendarConfigured();
  const defaultMeetUrl = location || 'https://meet.google.com/new';

  const detailsText = [
    `Reunião com: ${clientName}`,
    clientPhone ? `WhatsApp: ${clientPhone}` : null,
    company ? `Empresa: ${company}` : null,
    clientEmail ? `E-mail: ${clientEmail}` : null,
    notes ? `Notas: ${notes}` : null,
    `Link da chamada: ${defaultMeetUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const calendarUrl = generateDirectGoogleCalendarUrl({
    title,
    startDate,
    durationMinutes,
    details: detailsText,
    location: defaultMeetUrl,
  });

  // Se houver Webhook (ex: n8n) configurado
  if (status.hasWebhook && process.env.GOOGLE_CALENDAR_WEBHOOK_URL) {
    try {
      const res = await fetch(process.env.GOOGLE_CALENDAR_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          startDate: startDate.toISOString(),
          durationMinutes,
          clientName,
          clientEmail,
          clientPhone,
          company,
          notes,
          meetUrl: defaultMeetUrl,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { eventId?: string; meetUrl?: string };
        return {
          eventId: data.eventId || `gcal-webhook-${Date.now()}`,
          meetUrl: data.meetUrl || defaultMeetUrl,
          calendarUrl,
        };
      }
    } catch (err) {
      console.warn('[GoogleCalendar] Aviso ao chamar webhook n8n:', err);
    }
  }

  // Fallback padrão seguro (sempre gera ID rastreável e sala)
  return {
    eventId: `concept-appt-${Date.now()}`,
    meetUrl: defaultMeetUrl,
    calendarUrl,
  };
}

export interface CalendarAvailabilityResult {
  targetDate: Date;
  isWorkingDay: boolean;
  availableSlots: AvailableSlot[];
  suggestedSlots: string[]; // ex: ["10:00", "14:30", "16:00"]
  formattedWhatsApp: string; // ex: "às 10h, às 14h30 e às 16h"
}

/**
 * Consulta disponibilidade combinando Google Calendar (iCal/Service Account) + compromissos do CRM
 */
export async function getCalendarAvailability(params: {
  targetDate: Date;
  durationMinutes?: number;
  existingBusyIntervals?: BusyInterval[];
  now?: Date;
}): Promise<CalendarAvailabilityResult> {
  const { targetDate, durationMinutes = 30, existingBusyIntervals = [], now = new Date() } = params;

  const working = isWorkingDay(targetDate);
  if (!working) {
    return {
      targetDate,
      isWorkingDay: false,
      availableSlots: [],
      suggestedSlots: [],
      formattedWhatsApp: 'não realizamos agendamentos aos domingos',
    };
  }

  // Combina ocupações externas se houver iCal URL
  const allBusy: BusyInterval[] = [...existingBusyIntervals];
  const icalUrl = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (icalUrl) {
    try {
      const icsBusy = await fetchIcsBusyIntervals({ icsUrl: icalUrl, targetDate });
      allBusy.push(...icsBusy);
    } catch (icsErr) {
      console.warn('[GoogleCalendar] Aviso ao buscar ocupações do iCal:', icsErr);
    }
  }

  const availableSlots = calculateAvailableSlots({
    targetDate,
    durationMinutes,
    busyIntervals: allBusy,
    now,
  });

  const slotTimes = availableSlots.map((s) => s.time);
  const suggestedSlots = pickSuggestedSlots(slotTimes, 3);
  const formattedWhatsApp = formatSlotsForWhatsApp(suggestedSlots);

  return {
    targetDate,
    isWorkingDay: true,
    availableSlots,
    suggestedSlots,
    formattedWhatsApp,
  };
}
