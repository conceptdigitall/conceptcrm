import { NextRequest, NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { isWorkingDay } from '@/lib/calendar/rules';
import { createCalendarEvent } from '@/lib/calendar/google';

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  // Conta e usuário vêm da sessão; account_id/user_id do corpo são ignorados.
  const { accountId: account_id, userId: user_id } = ctx;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      contact_id,
      title,
      scheduled_at,
      duration_minutes = 30,
      client_name,
      client_email,
      client_phone,
      company,
      notes,
    } = body;

    if (!scheduled_at) {
      return NextResponse.json(
        { error: 'Campo "scheduled_at" é obrigatório no formato ISO' },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: 'Data de agendamento inválida' }, { status: 400 });
    }

    if (!isWorkingDay(scheduledDate)) {
      return NextResponse.json(
        { error: 'Não realizamos agendamentos aos domingos. Escolha de segunda a sábado.' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // supabaseAdmin ignora RLS: confere que o contato é da conta de quem chama.
    if (contact_id) {
      const { data: contact } = await db
        .from('contacts')
        .select('id')
        .eq('id', contact_id)
        .eq('account_id', account_id)
        .maybeSingle();
      if (!contact) {
        return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
      }
    }

    const duration = Math.max(15, Math.min(120, Number(duration_minutes) || 30));
    const resolvedTitle = title || `Sessão de Diagnóstico & Demonstração${client_name ? ` - ${client_name}` : ''}`;

    // Criação no Google Calendar / link universal
    const calendarResult = await createCalendarEvent({
      title: resolvedTitle,
      startDate: scheduledDate,
      durationMinutes: duration,
      clientName: client_name,
      clientEmail: client_email,
      clientPhone: client_phone,
      company,
      notes,
    });

    // Insere agendamento no Supabase
    const appointmentPayload: Record<string, unknown> = {
      title: resolvedTitle,
      scheduled_at: scheduledDate.toISOString(),
      duration_minutes: duration,
      status: 'confirmed',
      meeting_url: calendarResult.meetUrl,
      notes: notes || null,
      google_event_id: calendarResult.eventId,
      synced_at: new Date().toISOString(),
    };

    appointmentPayload.account_id = account_id;
    appointmentPayload.user_id = user_id;
    if (contact_id) appointmentPayload.contact_id = contact_id;

    const { data: createdAppt, error: apptError } = await db
      .from('appointments')
      .insert(appointmentPayload)
      .select('*')
      .single();

    if (apptError) {
      console.error('[Calendar Events API] Erro ao gravar agendamento no banco:', apptError);
      return NextResponse.json(
        { error: `Erro ao gravar agendamento: ${apptError.message}` },
        { status: 500 }
      );
    }

    // Se houver contato informado, atualiza os dados cadastrais
    if (contact_id) {
      try {
        const contactUpdates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (client_name && client_name.trim()) contactUpdates.name = client_name.trim();
        if (client_email && client_email.trim()) contactUpdates.email = client_email.trim();
        if (company && company.trim()) contactUpdates.company = company.trim();

        await db.from('contacts').update(contactUpdates).eq('id', contact_id);

        if (notes || company || client_email) {
          await db.from('contact_notes').insert({
            contact_id,
            user_id,
            note_text: `📅 Reunião agendada via CRM: ${scheduledDate.toLocaleString('pt-BR')}\nGoogle Meet: ${calendarResult.meetUrl}`,
          });
        }
      } catch (contactErr) {
        console.warn('[Calendar Events API] Aviso ao atualizar dados do contato:', contactErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        appointment: createdAppt,
        meetUrl: calendarResult.meetUrl,
        calendarUrl: calendarResult.calendarUrl,
        eventId: calendarResult.eventId,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[Calendar Events API] Falha na criação:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
