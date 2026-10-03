import type { BusyInterval } from './rules';

export interface CalendarEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  status?: string;
}

/**
 * Converte string iCal no formato YYYYMMDDTHHMMSSZ ou YYYYMMDD em objeto Date
 */
function parseIcsDate(raw: string): Date | null {
  const clean = raw.trim();

  // Formato UTC completo: 20261012T130000Z
  const utcMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (utcMatch) {
    const [, y, m, d, hh, mm, ss] = utcMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  }

  // Formato data inteira (all-day): 20261012
  const dateMatch = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
  }

  // Tenta Date nativo como fallback
  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Faz parse de texto ICS (iCalendar) extraindo os eventos VEVENT.
 */
export function parseIcsEvents(icsContent: string): CalendarEvent[] {
  if (!icsContent || typeof icsContent !== 'string') {
    return [];
  }

  const events: CalendarEvent[] = [];
  const lines = icsContent.split(/\r?\n/);

  let inEvent = false;
  let currentUid = '';
  let currentSummary = '';
  let currentStart: Date | null = null;
  let currentEnd: Date | null = null;
  let currentStatus = 'CONFIRMED';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentUid = '';
      currentSummary = 'Compromisso';
      currentStart = null;
      currentEnd = null;
      currentStatus = 'CONFIRMED';
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent && currentStart && currentEnd && currentStatus !== 'CANCELLED') {
        events.push({
          uid: currentUid || `event-${events.length}`,
          summary: currentSummary,
          start: currentStart,
          end: currentEnd,
          status: currentStatus,
        });
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    if (line.startsWith('UID:')) {
      currentUid = line.substring(4).trim();
    } else if (line.startsWith('SUMMARY:')) {
      currentSummary = line.substring(8).trim();
    } else if (line.startsWith('STATUS:')) {
      currentStatus = line.substring(7).trim().toUpperCase();
    } else if (line.startsWith('DTSTART')) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        currentStart = parseIcsDate(parts[1]);
      }
    } else if (line.startsWith('DTEND')) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        currentEnd = parseIcsDate(parts[1]);
      }
    }
  }

  return events;
}

// Cache simples em memória para evitar hammering na URL do iCal
interface CacheEntry {
  events: CalendarEvent[];
  timestamp: number;
}
const icsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

export function clearIcsCache(): void {
  icsCache.clear();
}

/**
 * Busca o arquivo .ics da URL privada do Google Calendar e retorna
 * os intervalos ocupados que coincidem com a data solicitada.
 */
export async function fetchIcsBusyIntervals(params: {
  icsUrl?: string | null;
  targetDate: Date;
}): Promise<BusyInterval[]> {
  const { icsUrl, targetDate } = params;
  if (!icsUrl || !icsUrl.startsWith('http')) {
    return [];
  }

  try {
    let events: CalendarEvent[];
    const cached = icsCache.get(icsUrl);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      events = cached.events;
    } else {
      const res = await fetch(icsUrl, {
        headers: { 'User-Agent': 'ConceptCRM-CalendarSync/1.0' },
      });
      if (!res.ok) {
        console.warn(`[iCal] Falha ao carregar ICS (${res.status}): ${res.statusText}`);
        return [];
      }
      const text = await res.text();
      events = parseIcsEvents(text);
      icsCache.set(icsUrl, { events, timestamp: now });
    }

    // Calcula início e fim do dia alvo no fuso de Brasília (ou intervalo de 24h)
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayEnd.getTime();

    // Filtra eventos que colidem com esse dia
    const busyIntervals: BusyInterval[] = [];
    for (const ev of events) {
      const evStartMs = ev.start.getTime();
      const evEndMs = ev.end.getTime();

      // Se houver sobreposição com a janela do dia
      if (evStartMs < dayEndMs && evEndMs > dayStartMs) {
        busyIntervals.push({
          start: ev.start,
          end: ev.end,
        });
      }
    }

    return busyIntervals;
  } catch (err) {
    console.error('[iCal] Erro ao processar feed do calendário:', err);
    return [];
  }
}

/**
 * Remove prefixos acidentais (ex: GOOGLE_CALENDAR_ICAL_URL=) e aspas que o usuário
 * possa colar acidentalmente ao copiar variáveis de ambiente ou instruções.
 */
export function sanitizeIcalUrl(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw.trim();
  // Remove prefixo como GOOGLE_CALENDAR_ICAL_URL= ou ical_url=
  clean = clean.replace(/^[A-Za-z0-9_]+\s*=\s*/i, '');
  // Remove aspas simples ou duplas ao redor
  clean = clean.replace(/^['"]+|['"]+$/g, '');
  return clean.trim();
}

export function isGoogleIcalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'calendar.google.com';
  } catch {
    return false;
  }
}

export interface ValidateIcsResult {
  valid: boolean;
  eventsCount: number;
  calendarName?: string;
  error?: string;
}

/**
 * Valida se uma URL iCal é alcançável e retorna um arquivo VCALENDAR íntegro.
 */
export async function validateAndFetchIcs(rawUrl: string): Promise<ValidateIcsResult> {
  const url = sanitizeIcalUrl(rawUrl);
  if (!url || !url.startsWith('http')) {
    return {
      valid: false,
      eventsCount: 0,
      error: 'URL inválida. O link deve começar com https://',
    };
  }
  // Só busca no Google: sem isso o servidor faria fetch de qualquer endereço (SSRF).
  if (!isGoogleIcalUrl(url)) {
    return {
      valid: false,
      eventsCount: 0,
      error: 'Use o "Endereço secreto em formato iCal" do Google Agenda (https://calendar.google.com/...).',
    };
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ConceptCRM-CalendarSync/1.0' },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          valid: false,
          eventsCount: 0,
          error: 'Endereço iCal não encontrado (404). Verifique se o link secreto foi copiado corretamente.',
        };
      }
      if (res.status === 403 || res.status === 401) {
        return {
          valid: false,
          eventsCount: 0,
          error: 'Acesso negado (403). Use o "Endereço secreto em formato iCal", e não a URL pública.',
        };
      }
      return {
        valid: false,
        eventsCount: 0,
        error: `O Google retornou erro HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      return {
        valid: false,
        eventsCount: 0,
        error: 'O link retornado não é um arquivo de calendário iCal (.ics). Certifique-se de copiar o "Endereço secreto em formato iCal".',
      };
    }

    const nameMatch = text.match(/X-WR-CALNAME:(.+)/i);
    const calendarName = nameMatch ? nameMatch[1].trim() : undefined;

    const events = parseIcsEvents(text);
    return {
      valid: true,
      eventsCount: events.length,
      calendarName,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      eventsCount: 0,
      error: `Não foi possível conectar ao Google Calendar: ${message}`,
    };
  }
}
