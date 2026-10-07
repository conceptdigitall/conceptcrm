import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/safe-next'

// Destino dos links que o Supabase manda por e-mail (recuperar senha,
// confirmar cadastro). Troca o que veio no link por uma sessão (cookies)
// e segue para `next`.
//
// Dois formatos:
// - `code` (PKCE, o padrão do @supabase/ssr): só funciona no mesmo navegador
//   em que o link foi pedido, porque a outra metade fica num cookie dele.
// - `token_hash` + `type`: funciona em qualquer aparelho; é o que chega se o
//   modelo do e-mail no Supabase usar {{ .TokenHash }}.
//
// Se falhar (link vencido, usado ou aberto em outro navegador), volta para
// pedir outro em vez de mostrar 404.

const OTP_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  'recovery',
  'signup',
  'invite',
  'magiclink',
  'email_change',
  'email',
])

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const next = safeNextPath(url.searchParams.get('next'))
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null

  const supabase = await createClient()
  let failed = Boolean(url.searchParams.get('error'))

  if (!failed && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    failed = Boolean(error)
  } else if (!failed && tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    failed = Boolean(error)
  } else {
    failed = true
  }

  if (!failed) return NextResponse.redirect(new URL(next, url.origin))

  // Só o link de senha tem para onde voltar e pedir de novo.
  const isRecovery = next.startsWith('/reset-password') || type === 'recovery'
  const back = new URL(isRecovery ? '/forgot-password' : '/login', url.origin)
  back.searchParams.set('erro', 'link')
  return NextResponse.redirect(back)
}
