import { NextResponse } from 'next/server';
import { isGoogleCalendarConfigured } from '@/lib/calendar/google';
import { BUSINESS_HOURS } from '@/lib/calendar/rules';
import { maskIcalUrl } from '@/lib/calendar/config';

export async function GET() {
  const status = isGoogleCalendarConfigured();

  let modeLabel = 'Modo Local (CRM Supabase)';
  let description = 'Agendamentos e validações de horário gerenciados no banco de dados do CRM.';

  if (status.mode === 'service_account') {
    modeLabel = 'Conectado via Google Service Account';
    description = 'Sincronização bidirecional em tempo real com a Google Calendar API oficial.';
  } else if (status.mode === 'ical') {
    modeLabel = 'Conectado via Google Calendar iCal Privado';
    description = 'Leitura contínua dos compromissos da sua agenda Google sem necessidade de Google Cloud.';
  } else if (status.mode === 'webhook') {
    modeLabel = 'Conectado via Webhook n8n';
    description = 'Eventos despachados automaticamente para fluxo de agendamento no n8n.';
  }

  return NextResponse.json({
    success: true,
    mode: status.mode,
    modeLabel,
    description,
    hasServiceAccount: status.hasServiceAccount,
    hasIcal: status.hasIcal,
    maskedIcalUrl: maskIcalUrl(process.env.GOOGLE_CALENDAR_ICAL_URL),
    hasWebhook: status.hasWebhook,
    calendarId: status.calendarId,
    businessHours: {
      startHour: BUSINESS_HOURS.startHour,
      endHour: BUSINESS_HOURS.endHour,
      lunchStartHour: BUSINESS_HOURS.lunchStartHour,
      lunchEndHour: BUSINESS_HOURS.lunchEndHour,
      workingDaysText: 'Segunda a Sábado, das 09h às 18h (Almoço 12h às 13h)',
    },
  });
}
