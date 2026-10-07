// ============================================================
// GET /api/v1/availability?date=YYYY-MM-DD&duration=30
// Free slots for one day (scope: calendar:read).
//
// Same rules as the dashboard's `/api/calendar/availability`: business
// hours, no Sundays, confirmed CRM appointments and (when configured)
// the Google Calendar iCal feed count as busy. Dates are Brasília time.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getCalendarAvailability } from '@/lib/calendar/google';
import { clampDuration, loadBusyIntervals } from '@/lib/calendar/appointments';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'calendar:read');
    const url = new URL(request.url);
    const date = url.searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail('bad_request', "'date' is required as YYYY-MM-DD", 400);
    }
    const targetDate = new Date(`${date}T00:00:00-03:00`);
    if (isNaN(targetDate.getTime())) {
      return fail('bad_request', "'date' is not a valid date", 400);
    }
    const durationMinutes = clampDuration(url.searchParams.get('duration'));

    const busy = await loadBusyIntervals(ctx.supabase, ctx.accountId, date);
    const availability = await getCalendarAvailability({
      targetDate,
      durationMinutes,
      existingBusyIntervals: busy,
    });

    return ok({
      date,
      duration_minutes: durationMinutes,
      is_working_day: availability.isWorkingDay,
      available_slots: availability.availableSlots.map((s) => s.time),
      suggested_slots: availability.suggestedSlots,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
