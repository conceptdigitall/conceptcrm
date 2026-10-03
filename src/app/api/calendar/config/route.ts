import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import {
  getCalendarConfig,
  saveCalendarIcalUrl,
  removeCalendarIcalUrl,
} from '@/lib/calendar/config';

// O iCal fica em process.env e vale para o CRM inteiro, então só um admin
// da conta interna (Concept Digital) pode trocá-lo ou desconectá-lo.
async function requireCalendarAdmin(): Promise<NextResponse | null> {
  try {
    const ctx = await requireRole('admin');
    if (!isInternalAccount(ctx.accountId)) {
      return NextResponse.json(
        { success: false, error: 'Somente a conta da Concept Digital pode alterar a agenda.' },
        { status: 403 }
      );
    }
    return null;
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET() {
  try {
    await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }
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
  const denied = await requireCalendarAdmin();
  if (denied) return denied;
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
  const denied = await requireCalendarAdmin();
  if (denied) return denied;
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
