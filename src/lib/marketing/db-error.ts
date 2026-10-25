import { NextResponse } from 'next/server';

/** Erro do banco fica no log: a mensagem do Postgres expõe tabela e constraint. */
export function dbErrorResponse(scope: string, error: unknown): NextResponse {
  console.error(`[marketing/${scope}] erro no banco:`, error);
  return NextResponse.json({ error: 'Não foi possível concluir. Tente de novo.' }, { status: 500 });
}
