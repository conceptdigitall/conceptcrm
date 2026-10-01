import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { getCalendarAvailability, isGoogleCalendarConfigured } from '@/lib/calendar/google';
import type { BusyInterval } from '@/lib/calendar/rules';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date');
    const durationStr = searchParams.get('duration') || '30';
    const accountId = searchParams.get('accountId');

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

    const dayStart = new Date(`${dateStr}T00:00:00-03:00`);
    const dayEnd = new Date(`${dateStr}T23:59:59-03:00`);

    // Busca compromissos confirmados no Supabase para o dia
    const busyIntervals: BusyInterval[] = [];
    try {
      const db = supabaseAdmin();
      let query = db
        .from('appointments')
        .select('scheduled_at, duration_minutes, status')
        .eq('status', 'confirmed')
        .gte('scheduled_at', dayStart.toISOString())
        .lte('scheduled_at', dayEnd.toISOString());

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data: existingAppts } = await query;

      if (existingAppts && existingAppts.length > 0) {
        for (const appt of existingAppts) {
          const start = new Date(appt.scheduled_at);
          const duration = appt.duration_minutes || 30;
          const end = new Date(start.getTime() + duration * 60 * 1000);
          busyIntervals.push({ start, end });
        }
      }
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
