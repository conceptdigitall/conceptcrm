// Prospecção and Marketing are Concept Digital's internal tools: they spend
// Concept's Anthropic credits and scrape Google from Concept's machine.
// Unset or empty means nobody has access.
// The literal `process.env.NEXT_PUBLIC_…` read is required for Next to inline it.
export function internalAccountIds(
  raw: string | undefined = process.env.NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS,
): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function isInternalAccount(
  accountId: string | null | undefined,
  raw: string | undefined = process.env.NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS,
): boolean {
  return Boolean(accountId) && internalAccountIds(raw).includes(accountId as string);
}
