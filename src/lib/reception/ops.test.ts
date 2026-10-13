import { afterEach, describe, expect, it, vi } from 'vitest'

import { maskPhone, notifyOps, parseOrigin } from './ops'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('maskPhone', () => {
  it('keeps only the last 4 digits', () => {
    expect(maskPhone('5513999991234')).toBe('***1234')
  })
})

describe('parseOrigin', () => {
  it('extracts the code in lowercase', () => {
    expect(parseOrigin('Oi! #AB12cd')).toBe('ab12cd')
  })
  it('defaults to direto', () => {
    expect(parseOrigin('oi')).toBe('direto')
  })
})

describe('notifyOps', () => {
  it('posts to Telegram when configured', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok')
    vi.stubEnv('TELEGRAM_OPS_CHAT_ID', '42')
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true })
    await notifyOps('oi', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/bottok/sendMessage')
    expect(JSON.parse(init.body)).toEqual({ chat_id: '42', text: 'oi' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('falls back to WhatsApp without Telegram', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_OPS_CHAT_ID', '')
    vi.stubEnv('ADMIN_WHATSAPP_NUMBERS', '5513911112222, 5513933334444')
    const sendWhatsApp = vi.fn().mockResolvedValue(undefined)
    await notifyOps('alerta', { sendWhatsApp })
    expect(sendWhatsApp).toHaveBeenCalledTimes(2)
    expect(sendWhatsApp).toHaveBeenCalledWith('5513911112222', 'alerta')
  })

  it('only warns when nothing is configured', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('ADMIN_WHATSAPP_NUMBERS', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(notifyOps('x')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('never throws when fetch fails', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tok')
    vi.stubEnv('TELEGRAM_OPS_CHAT_ID', '42')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(
      notifyOps('x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeUndefined()
  })
})
