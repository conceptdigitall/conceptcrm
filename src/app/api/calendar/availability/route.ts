import { NextRequest, NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { getCalendarAvailability, isGoogleCalendarConfigured } from '@/lib/calendar/google';
import type { BusyInterval } from '@/lib/calendar/rules';
import { loadBusyIntervals } from '@/lib/calendar/appointments';

export async function GET(req: NextRequest) {
  let accountId: string;
  try {
    ({ accountId } = await requireRole('viewer'));
  } catch (err) {
    return toErrorResponse(err);
  }

  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date');
    const durationStr = searchParams.get('duration') || '30';

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json(
        { error: 'Parâmetro "date" (data) obrigatório no formato YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const durationMinutes = Math.max(15, Math.min(120, Number(durationStr) || 30));
    // Cria data base no fuso de Brasília
    const targetDate = new Date(`${dateStr}T00:00:00-03:00`);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    }

    // Busca compromissos confirmados no Supabase para o dia
    let busyIntervals: BusyInterval[] = [];
    try {
      // A conta vem da sessão, nunca da query string.
      busyIntervals = await loadBusyIntervals(supabaseAdmin(), accountId, dateStr);
    } catch (dbErr) {
      console.warn('[Calendar Availability] Aviso ao buscar agendamentos do Supabase:', dbErr);
    }

    const availability = await getCalendarAvailability({
      targetDate,
      durationMinutes,
      existingBusyIntervals: busyIntervals,
    });

    const status = isGoogleCalendarConfigured();

    return NextResponse.json({
      success: true,
      date: dateStr,
      isWorkingDay: availability.isWorkingDay,
      availableSlots: availability.availableSlots,
      suggestedSlots: availability.suggestedSlots,
      formattedWhatsApp: availability.formattedWhatsApp,
      integrationStatus: status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[Calendar Availability] Erro:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
