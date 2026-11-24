// Módulo Financeiro: quais contas podem usar a aba Financeiro.
// NEXT_PUBLIC_FINANCE_ACCOUNT_IDS, quando preenchida, manda. Vazia, vale a
// lista de contas internas da Concept (NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS), que
// é quem já vê Prospecção, Marketing e Documentos. As duas vazias = ninguém.
// A leitura literal de `process.env.NEXT_PUBLIC_…` é exigida para o Next embutir.
import { internalAccountIds } from '@/lib/internal-accounts';

export function financeAccountIds(
  raw: string | undefined = process.env.NEXT_PUBLIC_FINANCE_ACCOUNT_IDS,
  internalRaw: string | undefined = process.env.NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS,
): string[] {
  const own = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return own.length > 0 ? own : internalAccountIds(internalRaw);
}

export function isFinanceAccount(
  accountId: string | null | undefined,
  raw: string | undefined = process.env.NEXT_PUBLIC_FINANCE_ACCOUNT_IDS,
  internalRaw: string | undefined = process.env.NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS,
): boolean {
  return Boolean(accountId) && financeAccountIds(raw, internalRaw).includes(accountId as string);
}
