// ============================================================
// GET  /api/v1/appointments — list appointments (scope: calendar:read)
// POST /api/v1/appointments — create one        (scope: calendar:write)
//
// List filters: `?from=` / `?to=` (ISO, on scheduled_at; default: from
// now), `?status=`, `?contact_id=`, `?limit=` (1–100, default 50).
// Ordered by scheduled_at ascending — "what's next" is the common ask,
// so this is a time window, not a keyset-paginated feed.
//
// Create goes through the same core as the dashboard
// (`createAppointment`), including the Google Calendar webhook.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  APPOINTMENT_SELECT,
  appointmentErrorResponse,
  getAppointmentById,
  isAppointmentStatus,
  serializeAppointment,
} from '@/lib/api/v1/appointments';
import { AppointmentError, createAppointment } from '@/lib/calendar/appointments';
import { MAX_LIMIT, DEFAULT_LIMIT } from '@/lib/api/v1/pagination';

function parseIso(raw: string | null): string | null | 'invalid' {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? 'invalid' : d.toISOString();
}

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'calendar:read');
    const url = new URL(request.url);

    const from = parseIso(url.searchParams.get('from'));
    const to = parseIso(url.searchParams.get('to'));
    if (from === 'invalid' || to === 'invalid') {
      return fail('bad_request', "'from' and 'to' must be ISO dates", 400);
    }
    const status = url.searchParams.get('status');
    if (status && !isAppointmentStatus(status)) {
      return fail('bad_request', "'status' must be confirmed, cancelled or completed", 400);
    }
    const contactId = url.searchParams.get('contact_id');
    const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT));

    let query = ctx.supabase
      .from('appointments')
      .select(APPOINTMENT_SELECT)
      .eq('account_id', ctx.accountId)
      .gte('scheduled_at', from ?? new Date().toISOString());
    if (to) query = query.lte('scheduled_at', to);
    if (status) query = query.eq('status', status);
    if (contactId) query = query.eq('contact_id', contactId);

    const { data, error } = await query
      .order('scheduled_at', { ascending: true })
      .limit(limit);
    if (error) {
      console.error('[api/v1/appointments] list error:', error);
      return fail('internal', 'Failed to list appointments', 500);
    }
    return ok((data ?? []).map((r) => serializeAppointment(r as Record<string, unknown>)));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'calendar:write');
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const userId = ctx.createdBy ?? (await resolveAuditUserId(ctx.supabase, ctx.accountId));
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : null);
    const result = await createAppointment(ctx.supabase, ctx.accountId, userId, {
      contact_id: str('contact_id'),
      title: str('title'),
      scheduled_at: str('scheduled_at'),
      duration_minutes: body.duration_minutes as number | undefined,
      client_name: str('client_name'),
      client_email: str('client_email'),
      client_phone: str('client_phone'),
      company: str('company'),
      notes: str('notes'),
    });

    const appointment = await getAppointmentById(
      ctx.supabase,
      ctx.accountId,
      result.appointment.id as string
    );
    return ok({ ...appointment, calendar_url: result.calendarUrl }, 201);
  } catch (err) {
    if (err instanceof AppointmentError) return appointmentErrorResponse(err);
    return toApiErrorResponse(err);
  }
}
