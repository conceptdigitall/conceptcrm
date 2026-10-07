// O `next` vem da URL do e-mail (`/auth/callback?next=...`), que qualquer um
// pode montar. Só aceitamos caminho interno: começa com "/" e não com "//"
// nem "/\" (que o navegador trata como outro domínio). O resto vai para o
// fallback, para o link de recuperação não virar um redirecionamento aberto.
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f]/.test(next)) return fallback
  return next
}
