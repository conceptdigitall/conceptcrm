// Brazilian phone normalization for Google Maps listings. Output matches
// how WhatsApp contacts are stored (digits, country code first), so the
// contacts (account_id, phone_normalized) unique index dedupes promoted
// leads against people who already messaged us.

export function normalizeBrPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0800') || digits.startsWith('800')) return null;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

export function isBrMobile(normalized: string | null): boolean {
  if (!normalized) return false;
  const local = normalized.slice(4); // after 55 + DDD
  return local.length === 9 && local.startsWith('9');
}
