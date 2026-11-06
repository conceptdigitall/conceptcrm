// Módulo Loja (pedidos, pós-venda e analytics): só as contas de loja listadas
// em NEXT_PUBLIC_STORE_ACCOUNT_IDS veem as abas Pedidos e Loja. Vazio = ninguém.
// A leitura literal de `process.env.NEXT_PUBLIC_…` é exigida para o Next embutir.
export function storeAccountIds(
  raw: string | undefined = process.env.NEXT_PUBLIC_STORE_ACCOUNT_IDS,
): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function isStoreAccount(
  accountId: string | null | undefined,
  raw: string | undefined = process.env.NEXT_PUBLIC_STORE_ACCOUNT_IDS,
): boolean {
  return Boolean(accountId) && storeAccountIds(raw).includes(accountId as string);
}
