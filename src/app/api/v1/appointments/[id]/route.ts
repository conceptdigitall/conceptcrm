// ============================================================
// GET   /api/v1/appointments/:id — read one        (scope: calendar:read)
// PATCH /api/v1/appointments/:id — reschedule, cancel, complete or
//                                  edit title/notes (scope: calendar:write)
//
// PATCH body (any subset): { status, scheduled_at, duration_minutes,
// title, notes }. Cancelling is `{ "status": "cancelled" }` — there is
// no DELETE on purpose: the row stays for history.
//
// Note: rescheduling updates the CRM only. An event already created in
// Google Calendar through the n8n webhook is not moved.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  appointmentErrorResponse,
  getAppointmentById,
  updateAppointment,
} from '@/lib/api/v1/appointments';
import { AppointmentError } from '@/lib/calendar/appointments';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'calendar:read');
    const { id } = await params;
    const appointment = await getAppointmentById(ctx.supabase, ctx.accountId, id);
    if (!appointment) return fail('not_found', 'Appointment not found', 404);
    return ok(appointment);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'calendar:write');
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }
    return ok(await updateAppointment(ctx.supabase, ctx.accountId, id, body));
  } catch (err) {
    if (err instanceof AppointmentError) return appointmentErrorResponse(err);
    return toApiErrorResponse(err);
  }
}
