import fs from 'fs';
import path from 'path';
import { sanitizeIcalUrl, validateAndFetchIcs, clearIcsCache } from './ical';
import { isGoogleCalendarConfigured, type CalendarIntegrationMode } from './google';

export interface CalendarConfigState {
  configured: boolean;
  mode: CalendarIntegrationMode;
  hasIcal: boolean;
  maskedIcalUrl: string | null;
  calendarId: string;
}

/**
 * Mascara a URL do iCal para não expor a chave secreta completa na interface.
 */
export function maskIcalUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/');
    if (pathParts.length > 2) {
      // Ex: /calendar/ical/usuario/private-xxxx/basic.ics -> /calendar/ical/.../basic.ics
      const fileName = pathParts[pathParts.length - 1];
      return `${parsed.origin}/calendar/ical/.../${fileName}`;
    }
    return `${parsed.origin}${parsed.pathname.slice(0, 15)}...`;
  } catch {
    return 'https://calendar.google.com/.../basic.ics';
  }
}

/**
 * Retorna o estado atual da configuração do calendário.
 */
export function getCalendarConfig(): CalendarConfigState {
  const status = isGoogleCalendarConfigured();
  const rawIcal = process.env.GOOGLE_CALENDAR_ICAL_URL || null;

  return {
    configured: status.mode !== 'local_crm',
    mode: status.mode,
    hasIcal: status.hasIcal,
    maskedIcalUrl: maskIcalUrl(rawIcal),
    calendarId: status.calendarId,
  };
}

function getEnvLocalPath(): string {
  return path.resolve(process.cwd(), '.env.local');
}

/**
 * Salva a URL do iCal após validação rigorosa, atualizando process.env, .env.local e limpando caches.
 */
export async function saveCalendarIcalUrl(rawUrl: string): Promise<{
  success: boolean;
  eventsCount: number;
  calendarName?: string;
  maskedUrl: string | null;
}> {
  const cleanUrl = sanitizeIcalUrl(rawUrl);
  if (!cleanUrl) {
    throw new Error('A URL do calendário não pode estar vazia.');
  }

  // Valida a URL com o Google Calendar
  const validation = await validateAndFetchIcs(cleanUrl);
  if (!validation.valid) {
    throw new Error(validation.error || 'Não foi possível validar o arquivo de calendário iCal.');
  }

  // Atualiza no processo Node atual para efeito instantâneo
  process.env.GOOGLE_CALENDAR_ICAL_URL = cleanUrl;
  clearIcsCache();

  // Persiste no arquivo .env.local se existir
  try {
    const envPath = getEnvLocalPath();
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    const regex = /^GOOGLE_CALENDAR_ICAL_URL=.*$/m;
    const newLine = `GOOGLE_CALENDAR_ICAL_URL="${cleanUrl}"`;

    if (regex.test(content)) {
      content = content.replace(regex, newLine);
    } else {
      content = content.trimEnd() + (content.length > 0 ? '\n' : '') + newLine + '\n';
    }

    fs.writeFileSync(envPath, content, 'utf8');
  } catch (fileErr) {
    console.warn('[CalendarConfig] Aviso ao gravar .env.local:', fileErr);
  }

  return {
    success: true,
    eventsCount: validation.eventsCount,
    calendarName: validation.calendarName,
    maskedUrl: maskIcalUrl(cleanUrl),
  };
}

/**
 * Remove a configuração iCal do calendário.
 */
export async function removeCalendarIcalUrl(): Promise<{ success: boolean }> {
  delete process.env.GOOGLE_CALENDAR_ICAL_URL;
  clearIcsCache();

  try {
    const envPath = getEnvLocalPath();
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      const regex = /^GOOGLE_CALENDAR_ICAL_URL=.*\r?\n?/m;
      content = content.replace(regex, '');
      fs.writeFileSync(envPath, content, 'utf8');
    }
  } catch (fileErr) {
    console.warn('[CalendarConfig] Aviso ao limpar .env.local:', fileErr);
  }

  return { success: true };
}
