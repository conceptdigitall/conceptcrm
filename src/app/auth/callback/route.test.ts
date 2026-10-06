import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const exchangeCodeForSession = vi.fn()
const verifyOtp = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}))

const { GET } = await import('./route')

const call = (query: string) => GET(new NextRequest(`https://crm.example.com/auth/callback${query}`))
const location = (res: Response) => res.headers.get('location')

describe('GET /auth/callback', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null })
    verifyOtp.mockReset().mockResolvedValue({ error: null })
  })

  it('link de senha com code: cria a sessão e vai para /reset-password', async () => {
    const res = await call('?code=abc&next=/reset-password')

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc')
    expect(location(res)).toBe('https://crm.example.com/reset-password')
  })

  it('link com token_hash (qualquer aparelho): verifica e segue', async () => {
    const res = await call('?token_hash=th&type=recovery&next=/reset-password')

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'recovery' })
    expect(location(res)).toBe('https://crm.example.com/reset-password')
  })

  it('sem next, vai para o painel', async () => {
    const res = await call('?code=abc')
    expect(location(res)).toBe('https://crm.example.com/dashboard')
  })

  it('next externo é ignorado (sem redirecionamento aberto)', async () => {
    const res = await call('?code=abc&next=//golpe.example')
    expect(location(res)).toBe('https://crm.example.com/dashboard')
  })

  it('link vencido ou de outro navegador: volta para pedir outro', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error('invalid flow state') })

    const res = await call('?code=velho&next=/reset-password')

    expect(location(res)).toBe('https://crm.example.com/forgot-password?erro=link')
  })

  it('erro vindo do Supabase na URL: não tenta trocar o código', async () => {
    const res = await call('?error=access_denied&error_code=otp_expired&next=/reset-password')

    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(location(res)).toBe('https://crm.example.com/forgot-password?erro=link')
  })

  it('confirmação de cadastro que falha volta para o login', async () => {
    verifyOtp.mockResolvedValue({ error: new Error('expired') })

    const res = await call('?token_hash=th&type=signup')

    expect(location(res)).toBe('https://crm.example.com/login?erro=link')
  })

  it('sem code nem token_hash: não chama o Supabase', async () => {
    const res = await call('?next=/reset-password')

    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(location(res)).toBe('https://crm.example.com/forgot-password?erro=link')
  })

  it('type desconhecido no token_hash é recusado', async () => {
    const res = await call('?token_hash=th&type=qualquer')

    expect(verifyOtp).not.toHaveBeenCalled()
    expect(location(res)).toBe('https://crm.example.com/login?erro=link')
  })
})
