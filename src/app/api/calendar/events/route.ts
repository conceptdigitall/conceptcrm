import { NextRequest, NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { AppointmentError, createAppointment } from '@/lib/calendar/appointments';

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  // Conta e usuário vêm da sessão; account_id/user_id do corpo são ignorados.
  const { accountId, userId } = ctx;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await createAppointment(supabaseAdmin(), accountId, userId, body ?? {});

    return NextResponse.json(
      {
        success: true,
        appointment: result.appointment,
        meetUrl: result.meetUrl,
        calendarUrl: result.calendarUrl,
        eventId: result.eventId,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof AppointmentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[Calendar Events API] Falha na criação:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
