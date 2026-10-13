/** Mask a phone for logs: only the last 4 digits survive. */
export function maskPhone(p: string): string {
  return '***' + String(p ?? '').replace(/\D/g, '').slice(-4)
}

/** Extract the 6-char origin code (`#abc123`) from a first message; 'direto' if none. */
export function parseOrigin(text: string): string {
  const m = /#([a-z0-9]{6})\b/i.exec(text ?? '')
  return m ? m[1].toLowerCase() : 'direto'
}

export interface NotifyDeps {
  fetchImpl?: typeof fetch
  sendWhatsApp?: (number: string, text: string) => Promise<unknown>
}

/** Alert the operators (Telegram, else WhatsApp). Never throws. */
export async function notifyOps(text: string, deps: NotifyDeps = {}): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_OPS_CHAT_ID
    if (token && chatId) {
      const f = deps.fetchImpl ?? fetch
      const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      })
      if (res && (res as Response).ok === false) {
        console.warn('[reception/ops] Telegram respondeu com erro', (res as Response).status)
      }
      return
    }

    const numbers = (process.env.ADMIN_WHATSAPP_NUMBERS ?? '')
      .split(',')
      .map((n) => n.trim().replace(/\D/g, ''))
      .filter(Boolean)
    if (!deps.sendWhatsApp || numbers.length === 0) {
      console.warn('[reception/ops] Sem canal de aviso configurado; aviso descartado:', text)
      return
    }
    for (const n of numbers) {
      try {
        await deps.sendWhatsApp(n, text)
      } catch (err) {
        console.warn(`[reception/ops] Falha ao avisar ${maskPhone(n)}:`, err)
      }
    }
  } catch (err) {
    console.warn('[reception/ops] notifyOps falhou:', err)
  }
}
