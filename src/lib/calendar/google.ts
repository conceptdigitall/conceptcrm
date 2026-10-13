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
  /** true quando o link é de uma reunião Meet real (não o link genérico /new) */
  meetCreated: boolean;
}

/**
 * Cria evento real com Google Meet via OAuth (refresh token da conta do João).
 * Escopo: https://www.googleapis.com/auth/calendar.events
 */
export async function createMeetEvent(
  p: CreateEventParams,
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<{ eventId: string; meetUrl: string }> {
  const doFetch = deps.fetchImpl ?? fetch;
  const duration = p.durationMinutes ?? 30;

  const tokenRes = await doFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!tokenRes.ok) {
    throw new Error(`oauth_token_failed_${tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error('oauth_token_missing');

  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const end = new Date(p.startDate.getTime() + duration * 60000);
  const description = [
    p.clientName ? `Reunião com: ${p.clientName}` : null,
    p.clientPhone ? `WhatsApp: ${p.clientPhone}` : null,
    p.company ? `Empresa: ${p.company}` : null,
    p.clientEmail ? `E-mail: ${p.clientEmail}` : null,
    p.notes ? `Notas: ${p.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const eventRes = await doFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: p.title,
        description,
        start: { dateTime: p.startDate.toISOString(), timeZone: 'America/Sao_Paulo' },
        end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
        attendees: p.clientEmail ? [{ email: p.clientEmail }] : [],
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    }
  );
  if (!eventRes.ok) {
    throw new Error(`calendar_insert_failed_${eventRes.status}`);
  }
  const json = (await eventRes.json()) as { id?: string; hangoutLink?: string };
  if (!json.hangoutLink) throw new Error('calendar_missing_hangout_link');

  return { eventId: json.id || `gcal-${Date.now()}`, meetUrl: json.hangoutLink };
}

/**
 * Cria o evento no Google Calendar utilizando o melhor canal disponível:
 * 1. OAuth (refresh token) com Meet real (se configurado)
 * 2. Webhook n8n (se configurado)
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

  // 1. OAuth: evento real com Google Meet
  if (
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    try {
      const meet = await createMeetEvent(params);
      return { eventId: meet.eventId, meetUrl: meet.meetUrl, calendarUrl, meetCreated: true };
    } catch (err) {
      console.warn(
        '[GoogleCalendar] Falha ao criar Meet via OAuth:',
        err instanceof Error ? err.message : 'erro desconhecido'
      );
    }
  }

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
          meetCreated: Boolean(data.meetUrl),
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
    meetCreated: false,
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
