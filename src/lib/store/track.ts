// Validação dos eventos que o site da loja manda para /api/loja/track.
// Não guardamos IP. País/estado vêm dos cabeçalhos da Vercel.

export const STORE_EVENT_TYPES = [
  'page_view',
  'heartbeat',
  'product_view',
  'product_spin',
  'color_select',
  'size_select',
  'filter_click',
  'add_to_cart',
  'checkout_start',
  'leave',
] as const
export type StoreEventType = (typeof STORE_EVENT_TYPES)[number]

export const MAX_EVENTS_PER_BATCH = 20
export const MAX_DURATION_MS = 60_000

export type StoreEventRow = {
  account_id: string
  visitor_id: string
  session_id: string
  type: StoreEventType
  path: string | null
  product_slug: string | null
  value: string | null
  referrer_source: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  device: 'mobile' | 'tablet' | 'desktop'
  country: string | null
  region: string | null
  duration_ms: number | null
}

const ID = /^[A-Za-z0-9_-]{1,64}$/

const cut = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export function referrerSource(referrer: unknown): string {
  if (typeof referrer !== 'string' || !referrer) return 'direct'
  let host: string
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return 'other'
  }
  if (host.includes('instagram')) return 'instagram'
  if (host.includes('facebook') || host === 'fb.me' || host.endsWith('.fb.com')) return 'facebook'
  if (host.includes('google')) return 'google'
  if (host.includes('tiktok')) return 'tiktok'
  return 'other'
}

export function deviceFrom(ua: string | null): 'mobile' | 'tablet' | 'desktop' {
  const s = (ua ?? '').toLowerCase()
  if (/ipad|tablet|(android(?!.*mobile))/.test(s)) return 'tablet'
  if (/mobi|iphone|ipod|android/.test(s)) return 'mobile'
  return 'desktop'
}

export function parseTrackPayload(
  accountId: string,
  body: unknown,
  headers: Headers,
): { ok: true; rows: StoreEventRow[] } | { ok: false; error: string } {
  const events = (body as { events?: unknown })?.events
  if (!Array.isArray(events) || events.length === 0) return { ok: false, error: 'no events' }
  if (events.length > MAX_EVENTS_PER_BATCH) return { ok: false, error: 'too many events' }

  const device = deviceFrom(headers.get('user-agent'))
  const country = cut(headers.get('x-vercel-ip-country'), 8)
  const region = cut(headers.get('x-vercel-ip-country-region'), 16)
  const rows: StoreEventRow[] = []

  for (const raw of events as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'bad event' }
    const type = raw.type as StoreEventType
    if (!STORE_EVENT_TYPES.includes(type)) return { ok: false, error: 'bad type' }
    if (typeof raw.visitor_id !== 'string' || !ID.test(raw.visitor_id)) return { ok: false, error: 'bad visitor_id' }
    if (typeof raw.session_id !== 'string' || !ID.test(raw.session_id)) return { ok: false, error: 'bad session_id' }

    let duration: number | null = null
    if (type === 'heartbeat' || type === 'leave') {
      const d = Number(raw.duration_ms)
      if (!Number.isFinite(d) || d < 0 || d > MAX_DURATION_MS) continue
      duration = Math.round(d)
    }

    rows.push({
      account_id: accountId,
      visitor_id: raw.visitor_id,
      session_id: raw.session_id,
      type,
      path: cut(raw.path),
      product_slug: cut(raw.product_slug),
      value: cut(raw.value),
      referrer_source: type === 'page_view' ? referrerSource(raw.referrer) : null,
      utm_source: cut(raw.utm_source, 100),
      utm_medium: cut(raw.utm_medium, 100),
      utm_campaign: cut(raw.utm_campaign, 100),
      device,
      country,
      region,
      duration_ms: duration,
    })
  }
  return { ok: true, rows }
}
