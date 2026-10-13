import { NicheKey, getNicheConfig } from '../../config/niches';

export type ReactivationUrgency = 'no_ciclo' | 'atrasado' | 'critico';

export interface CandidateAppointment {
  id: string;
  start_time: string;
  status: string;
}

export interface CandidateContact {
  id: string;
  name: string;
  phone: string;
  last_interaction_at?: string | null;
  last_appointment_at?: string | null;
  appointments?: CandidateAppointment[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ReactivationOptions {
  niche: NicheKey;
  thresholdDays?: number;
  referenceDate?: Date | string;
  cooldownDays?: number;
}

export interface ReactivationResult {
  contact: CandidateContact;
  daysInactive: number;
  lastActivityDate: string;
  urgency: ReactivationUrgency;
  urgencyLabel: string;
}

const URGENCY_LABELS: Record<ReactivationUrgency, string> = {
  no_ciclo: 'No momento ideal',
  atrasado: 'Atrasado',
  critico: 'Crítico / Sumido',
};

function parseDate(d: Date | string | undefined | null): Date | null {
  if (!d) return null;
  const parsed = typeof d === 'string' ? new Date(d) : d;
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getMostRecentActivity(contact: CandidateContact): Date | null {
  const interactionDate = parseDate(contact.last_interaction_at);
  const appointmentDate = parseDate(contact.last_appointment_at);

  if (!interactionDate && !appointmentDate) return null;
  if (!interactionDate) return appointmentDate;
  if (!appointmentDate) return interactionDate;

  return interactionDate.getTime() > appointmentDate.getTime()
    ? interactionDate
    : appointmentDate;
}

function hasFutureAppointment(
  appointments: CandidateAppointment[] | undefined,
  refTime: number
): boolean {
  if (!appointments || appointments.length === 0) return false;

  return appointments.some((app) => {
    const appDate = parseDate(app.start_time);
    if (!appDate) return false;
    const isFuture = appDate.getTime() > refTime;
    const isActiveStatus =
      app.status === 'scheduled' ||
      app.status === 'confirmed' ||
      app.status === 'pending';
    return isFuture && isActiveStatus;
  });
}

function classifyUrgency(days: number, threshold: number): ReactivationUrgency {
  if (days < threshold * 1.5) return 'no_ciclo';
  if (days < threshold * 2.5) return 'atrasado';
  return 'critico';
}

export function filterReactivationCandidates(
  contacts: CandidateContact[],
  options: ReactivationOptions
): ReactivationResult[] {
  const nicheConfig = getNicheConfig(options.niche);
  const thresholdDays = options.thresholdDays ?? nicheConfig.defaultReactivationDays;
  const cooldownDays = options.cooldownDays ?? 7;

  const refDate = options.referenceDate
    ? parseDate(options.referenceDate) ?? new Date()
    : new Date();
  const refTime = refDate.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const results: ReactivationResult[] = [];

  for (const contact of contacts) {
    // Exclude if contact has any confirmed or pending future appointment (Socratic Gate A2)
    if (hasFutureAppointment(contact.appointments, refTime)) {
      continue;
    }

    const lastActivity = getMostRecentActivity(contact);
    if (!lastActivity) {
      continue;
    }

    const diffMs = refTime - lastActivity.getTime();
    if (diffMs < 0) {
      // Future activity date
      continue;
    }

    const daysInactive = Math.floor(diffMs / oneDayMs);

    // Cooldown check: ignore if active in recent days (e.g. 7 days)
    if (daysInactive < cooldownDays) {
      continue;
    }

    // Threshold check: must have reached niche cycle
    if (daysInactive < thresholdDays) {
      continue;
    }

    const urgency = classifyUrgency(daysInactive, thresholdDays);

    results.push({
      contact,
      daysInactive,
      lastActivityDate: lastActivity.toISOString(),
      urgency,
      urgencyLabel: URGENCY_LABELS[urgency],
    });
  }

  // Sort descending by inactivity (most overdue first)
  results.sort((a, b) => b.daysInactive - a.daysInactive);

  return results;
}
