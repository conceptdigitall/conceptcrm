// Decide de onde vêm os dados de cada requisição das rotas /api/financeiro.
//
// - FINANCE_STORAGE=local (só fora de produção): arquivo .data/financeiro.json,
//   sem login, uma pessoa só. É o modo de teste na máquina.
// - Qualquer outro caso: Supabase, exigindo login, papel admin e conta liberada
//   em NEXT_PUBLIC_FINANCE_ACCOUNT_IDS. Sem isso, a rota responde 401/403/404.
//
// Servidor apenas (importa next/headers via @/lib/auth/account).

import path from 'node:path';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isFinanceAccount } from '@/lib/finance-accounts';
import { createLocalRepository } from './local-repository';
import { RateUnavailableError } from './rates';
import type { FinanceRepository } from './repository';
import { FinanceInputError } from './service';
import { createReceivablesStore, type ReceivablesStore } from './receivables';
import { createSupabaseRepository, FinanceStorageError } from './supabase-repository';

export class NotFinanceAccountError extends Error {
  readonly status = 404;
}

/** true só quando FINANCE_STORAGE=local e o processo não é de produção. */
export function isLocalFinanceMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FINANCE_STORAGE === 'local' && env.NODE_ENV !== 'production';
}

let localRepo: FinanceRepository | null = null;

function getLocalRepo(): FinanceRepository {
  if (!localRepo) {
    const file = process.env.FINANCE_LOCAL_FILE || path.join(process.cwd(), '.data', 'financeiro.json');
    localRepo = createLocalRepository(file);
  }
  return localRepo;
}

export async function financeRepository(): Promise<FinanceRepository> {
  if (isLocalFinanceMode()) return getLocalRepo();
  const ctx = await requireRole('admin');
  if (!isFinanceAccount(ctx.accountId)) throw new NotFinanceAccountError('not a finance account');
  return createSupabaseRepository(ctx.supabase, ctx.accountId, ctx.userId);
}

/**
 * Repositório + cobranças/configurações. Cobranças dos contratos e painel do
 * Simples só existem com banco; no modo local respondem 400.
 */
export async function financeDbContext(): Promise<{ repo: FinanceRepository; store: ReceivablesStore }> {
  if (isLocalFinanceMode()) throw new FinanceInputError('Cobranças e Simples só funcionam com o banco (fora do modo local)');
  const ctx = await requireRole('admin');
  if (!isFinanceAccount(ctx.accountId)) throw new NotFinanceAccountError('not a finance account');
  return {
    repo: createSupabaseRepository(ctx.supabase, ctx.accountId, ctx.userId),
    store: createReceivablesStore(ctx.supabase, ctx.accountId),
  };
}

/** Converte erros conhecidos em resposta HTTP sem vazar detalhes internos. */
export function financeErrorResponse(err: unknown): Response {
  if (err instanceof NotFinanceAccountError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (err instanceof FinanceInputError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof RateUnavailableError) {
    return NextResponse.json(
      { error: 'Não foi possível buscar a cotação agora. Tente de novo ou informe a cotação manualmente.' },
      { status: 503 },
    );
  }
  if (err instanceof FinanceStorageError) {
    console.error('[financeiro]', err.message);
    return NextResponse.json({ error: 'Falha ao gravar ou ler os dados financeiros' }, { status: 500 });
  }
  return toErrorResponse(err);
}
