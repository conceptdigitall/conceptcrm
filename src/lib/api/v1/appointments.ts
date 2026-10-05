// ============================================================
// Public API — appointments (agenda). Serialization + the PATCH core
// for `/api/v1/appointments`. Creation reuses the dashboard core in
// `src/lib/calendar/appointments.ts` so both paths stay identical.
//
// Every query takes the service-role client from `requireApiKey`, so
// each one is filtered by `accountId` explicitly.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextResponse } from 'next/server';

import { fail } from '@/lib/api/v1/respond';
import {
  APPOINTMENT_STATUSES,
  AppointmentError,
  clampDuration,
  parseScheduledAt,
  type AppointmentStatus,
} from '@/lib/calendar/appointments';

export const APPOINTMENT_SELECT =
  'id, contact_id, title, scheduled_at, duration_minutes, status, meeting_url, notes, created_at, updated_at, contact:contacts(id, name, phone)';

export interface ApiAppointment {
  id: string;
  contact_id: string | null;
  contact: { id: string; name: string | null; phone: string } | null;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  meeting_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export function serializeAppointment(row: Record<string, unknown>): ApiAppointment {
  const contact = row.contact as { id: string; name: string | null; phone: string } | null;
  return {
    id: row.id as string,
    contact_id: (row.contact_id as string | null) ?? null,
    contact: contact ? { id: contact.id, name: contact.name ?? null, phone: contact.phone } : null,
    title: row.title as string,
    scheduled_at: row.scheduled_at as string,
    duration_minutes: (row.duration_minutes as number) ?? 30,
    status: row.status as string,
    meeting_url: (row.meeting_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === 'string' && (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Build the column patch from a PATCH body. Only whitelisted fields
 * pass; unknown keys are ignored. Throws AppointmentError(400) on bad
 * values and when nothing updatable was sent.
 */
export function buildAppointmentPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!isAppointmentStatus(body.status)) {
      throw new AppointmentError(
        `'status' must be one of: ${APPOINTMENT_STATUSES.join(', ')}`,
        400
      );
    }
    patch.status = body.status;
  }
  if (body.scheduled_at !== undefined) {
    patch.scheduled_at = parseScheduledAt(body.scheduled_at).toISOString();
  }
  if (body.duration_minutes !== undefined) {
    patch.duration_minutes = clampDuration(body.duration_minutes);
  }
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new AppointmentError("'title' must be a non-empty string", 400);
    }
    patch.title = body.title.trim();
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      throw new AppointmentError("'notes' must be a string or null", 400);
    }
    patch.notes = body.notes;
  }

  if (Object.keys(patch).length === 0) {
    throw new AppointmentError(
      'Nothing to update: send status, scheduled_at, duration_minutes, title or notes',
      400
    );
  }
  patch.updated_at = new Date().toISOString();
  return patch;
}

export async function getAppointmentById(
  db: SupabaseClient,
  accountId: string,
  id: string
): Promise<ApiAppointment | null> {
  const { data } = await db
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();
  return data ? serializeAppointment(data as Record<string, unknown>) : null;
}

export async function updateAppointment(
  db: SupabaseClient,
  accountId: string,
  id: string,
  body: Record<string, unknown>
): Promise<ApiAppointment> {
  const patch = buildAppointmentPatch(body);
  const { data, error } = await db
    .from('appointments')
    .update(patch)
    .eq('id', id)
    .eq('account_id', accountId)
    .select(APPOINTMENT_SELECT)
    .maybeSingle();
  if (error) {
    console.error('[api/v1/appointments] update error:', error);
    throw new AppointmentError('Failed to update appointment', 500);
  }
  if (!data) throw new AppointmentError('Appointment not found', 404);
  return serializeAppointment(data as Record<string, unknown>);
}

/**
 * Map an AppointmentError onto the v1 failure envelope. 5xx messages
 * can carry database text, so they collapse to a generic message —
 * same rule as `toApiErrorResponse`.
 */
export function appointmentErrorResponse(err: AppointmentError): NextResponse {
  if (err.status >= 500) return fail('internal', 'Failed to save appointment', err.status);
  const code = err.status === 404 ? 'not_found' : 'bad_request';
  return fail(code, err.message, err.status);
}
