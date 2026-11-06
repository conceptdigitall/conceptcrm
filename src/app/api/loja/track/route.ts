import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { corsHeaders, publicStoreAccount } from '@/lib/store/public-route'
import { loadStoreSettings } from '@/lib/store/settings'
import { parseTrackPayload } from '@/lib/store/track'

// O script manda text/plain (sendBeacon não faz preflight), então o corpo é
// lido como texto e convertido aqui.

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

export async function OPTIONS(request: Request) {
  const store = publicStoreAccount()
  if (store instanceof NextResponse) return store
  const loaded = await loadStoreSettings(supabaseAdmin(), store.accountId)
  return new NextResponse(null, { status: 204, headers: corsHeaders(loaded?.settings.siteUrl ?? null, request.headers.get('origin')) })
}

/** POST /api/loja/track — eventos do site (até 20 por envio). */
export async function POST(request: Request) {
  const store = publicStoreAccount()
  if (store instanceof NextResponse) return store

  const limit = checkRateLimit(`store-track:${clientIp(request)}`, RATE_LIMITS.storeTrack)
  if (!limit.success) return rateLimitResponse(limit)

  const db = supabaseAdmin()
  const loaded = await loadStoreSettings(db, store.accountId)
  const headers = corsHeaders(loaded?.settings.siteUrl ?? null, request.headers.get('origin'))

  let body: unknown = null
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400, headers })
  }
  const parsed = parseTrackPayload(store.accountId, body, request.headers)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers })

  if (parsed.rows.length) {
    const { error } = await db.from('store_events').insert(parsed.rows)
    if (error) console.error('[loja/track] insert failed:', error.message)
  }
  return new NextResponse(null, { status: 204, headers })
}
