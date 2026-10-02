import { NextResponse } from 'next/server';
import {
  getCalendarConfig,
  saveCalendarIcalUrl,
  removeCalendarIcalUrl,
} from '@/lib/calendar/config';

export async function GET() {
  try {
    const config = getCalendarConfig();
    return NextResponse.json({
      success: true,
      ...config,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Falha ao carregar configuração: ${message}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { icalUrl } = body || {};

    if (!icalUrl || typeof icalUrl !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Informe o link do Google Agenda. Cole o "Endereço secreto em formato iCal".',
        },
        { status: 400 }
      );
    }

    const result = await saveCalendarIcalUrl(icalUrl);

    return NextResponse.json({
      success: true,
      message: 'Google Agenda conectada e sincronizada com sucesso!',
      eventsCount: result.eventsCount,
      calendarName: result.calendarName,
      maskedUrl: result.maskedUrl,
      mode: 'ical',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  try {
    await removeCalendarIcalUrl();
    return NextResponse.json({
      success: true,
      message: 'Google Agenda desconectada com sucesso.',
      mode: 'local_crm',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: `Falha ao desconectar agenda: ${message}`,
      },
      { status: 500 }
    );
  }
}
