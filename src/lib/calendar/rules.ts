/**
 * Regras comerciais de atendimento e disponibilidade de agenda para a Concept Digital.
 * Fuso horário de referência: America/Sao_Paulo (UTC-3).
 */

export interface BusinessHours {
  startHour: number; // 09
  startMinute: number; // 00
  endHour: number; // 18
  endMinute: number; // 00
  lunchStartHour: number; // 12
  lunchEndHour: number; // 13
  workingDays: number[]; // 1 (Mon) to 6 (Sat)
}

export const BUSINESS_HOURS: BusinessHours = {
  startHour: 9,
  startMinute: 0,
  endHour: 18,
  endMinute: 0,
  lunchStartHour: 12,
  lunchEndHour: 13,
  workingDays: [1, 2, 3, 4, 5, 6], // Segunda a Sábado
};

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface AvailableSlot {
  time: string; // HH:mm (ex: "09:30")
  iso: string; // ISO 8601 string com fuso
  dateObj: Date;
}

/**
 * Retorna true se a data cair em dia útil (Segunda a Sábado).
 */
export function isWorkingDay(date: Date, hours: BusinessHours = BUSINESS_HOURS): boolean {
  // Converte para dia da semana no fuso de São Paulo
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(date);

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dayOfWeek = dayMap[parts] ?? date.getDay();
  return hours.workingDays.includes(dayOfWeek);
}

/**
 * Extrai componentes [ano, mes, dia] no fuso America/Sao_Paulo.
 */
function getSaoPauloYMD(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      p[part.type] = Number(part.value);
    }
  }
  return {
    year: p.year,
    month: p.month,
    day: p.day,
  };
}

/**
 * Cria uma data com horário específico no fuso de São Paulo (-03:00 padrão).
 */
function createSaoPauloDate(ymd: { year: number; month: number; day: number }, hour: number, minute: number): Date {
  const y = String(ymd.year).padStart(4, '0');
  const m = String(ymd.month).padStart(2, '0');
  const d = String(ymd.day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  // Usamos -03:00 (fuso oficial fixo de Brasília sem horário de verão)
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00-03:00`);
}

/**
 * Calcula todos os slots livres para uma data específica, respeitando:
 * 1. Dias de atendimento (Segunda a Sábado)
 * 2. Horário comercial (09h às 18h)
 * 3. Intervalo de almoço (12h às 13h)
 * 4. Intervalos ocupados (Google Calendar e Supabase appointments)
 * 5. Horário já decorrido hoje (com buffer mínimo de 15 minutos)
 */
export function calculateAvailableSlots(params: {
  targetDate: Date;
  durationMinutes?: number;
  busyIntervals?: BusyInterval[];
  now?: Date;
  businessHours?: BusinessHours;
}): AvailableSlot[] {
  const {
    targetDate,
    durationMinutes = 30,
    busyIntervals = [],
    now = new Date(),
    businessHours = BUSINESS_HOURS,
  } = params;

  if (!isWorkingDay(targetDate, businessHours)) {
    return [];
  }

  const ymd = getSaoPauloYMD(targetDate);
  const slots: AvailableSlot[] = [];

  const startMinutes = businessHours.startHour * 60 + businessHours.startMinute;
  const endMinutes = businessHours.endHour * 60 + businessHours.endMinute;
  const lunchStart = businessHours.lunchStartHour * 60;
  const lunchEnd = businessHours.lunchEndHour * 60;

  // Buffer de segurança para agendamento no próprio dia: mínimo 15 minutos de antecedência
  const minNoticeTime = now.getTime() + 15 * 60 * 1000;

  for (let currentMinute = startMinutes; currentMinute + durationMinutes <= endMinutes; currentMinute += durationMinutes) {
    const slotEndMinute = currentMinute + durationMinutes;

    // Se sobrepõe o almoço (12h às 13h)
    const overlapsLunch = !(slotEndMinute <= lunchStart || currentMinute >= lunchEnd);
    if (overlapsLunch) {
      continue;
    }

    const slotHour = Math.floor(currentMinute / 60);
    const slotMin = currentMinute % 60;
    const slotStart = createSaoPauloDate(ymd, slotHour, slotMin);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

    // Se a data do target é hoje e o slot já passou
    if (slotStart.getTime() < minNoticeTime) {
      continue;
    }

    // Checa sobreposição com intervalos ocupados
    const isBusy = busyIntervals.some((busy) => {
      const busyStart = busy.start.getTime();
      const busyEnd = busy.end.getTime();
      return slotStart.getTime() < busyEnd && slotEnd.getTime() > busyStart;
    });

    if (!isBusy) {
      const timeStr = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;
      slots.push({
        time: timeStr,
        iso: slotStart.toISOString(),
        dateObj: slotStart,
      });
    }
  }

  return slots;
}

/**
 * Seleciona estrategicamente até N slots bem distribuídos (manhã, início tarde, meio/fim tarde)
 * para sugestão direta e sem fricção na conversa com a IA.
 */
export function pickSuggestedSlots(availableSlotTimes: string[], maxSuggestions = 3): string[] {
  if (availableSlotTimes.length <= maxSuggestions) {
    return availableSlotTimes;
  }

  if (maxSuggestions === 1) {
    return [availableSlotTimes[0]];
  }

  if (maxSuggestions === 2) {
    return [availableSlotTimes[0], availableSlotTimes[Math.floor(availableSlotTimes.length / 2)]];
  }

  // Para 3: primeiro slot disponível, um do meio e um do terço final
  const first = availableSlotTimes[0];
  const midIndex = Math.floor(availableSlotTimes.length / 2);
  const mid = availableSlotTimes[midIndex];
  const lastIndex = availableSlotTimes.length - 1;
  const last = availableSlotTimes[lastIndex];

  return [first, mid, last];
}

/**
 * Formata horários para texto fluído no WhatsApp (sem asteriscos de markdown).
 * Ex: ["10:00", "14:30", "16:00"] -> "às 10h, às 14h30 e às 16h"
 */
export function formatSlotsForWhatsApp(slotTimes: string[]): string {
  if (!slotTimes || slotTimes.length === 0) {
    return 'nenhum horário disponível';
  }

  const formatSingle = (time: string) => {
    const [h, m] = time.split(':');
    const minPart = m === '00' ? '' : m;
    return `às ${Number(h)}h${minPart}`;
  };

  if (slotTimes.length === 1) {
    return formatSingle(slotTimes[0]);
  }

  if (slotTimes.length === 2) {
    return `${formatSingle(slotTimes[0])} e ${formatSingle(slotTimes[1])}`;
  }

  const allExceptLast = slotTimes.slice(0, -1).map(formatSingle).join(', ');
  const last = formatSingle(slotTimes[slotTimes.length - 1]);
  return `${allExceptLast} e ${last}`;
}
