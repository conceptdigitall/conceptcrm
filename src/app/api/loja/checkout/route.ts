import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { loadActiveProducts } from '@/lib/store/catalog'
import { priceCart } from '@/lib/store/pricing'
import { corsHeaders, publicStoreAccount } from '@/lib/store/public-route'
import { loadStoreSettings } from '@/lib/store/settings'
import { getStripe } from '@/lib/store/stripe'
import type { CartLine } from '@/lib/store/types'

/**
 * POST /api/loja/checkout — chamado pelo site da loja.
 * Corpo: { lines: [{ slug, color, size, qty }] }. Preço vem do banco.
 */
export async function OPTIONS(request: Request) {
  const store = publicStoreAccount()
  if (store instanceof NextResponse) return store
  const loaded = await loadStoreSettings(supabaseAdmin(), store.accountId)
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(loaded?.settings.siteUrl ?? null, request.headers.get('origin')),
  })
}

export async function POST(request: Request) {
  const store = publicStoreAccount()
  if (store instanceof NextResponse) return store

  const db = supabaseAdmin()
  const loaded = await loadStoreSettings(db, store.accountId)
  const siteUrl = loaded?.settings.siteUrl ?? null
  const headers = corsHeaders(siteUrl, request.headers.get('origin'))
  const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers })

  if (!loaded || !siteUrl || !loaded.secrets.stripeSecretKey) return fail(503, 'checkout_unavailable')

  let lines: CartLine[]
  try {
    const body = await request.json()
    if (!body || !Array.isArray(body.lines)) return fail(400, 'Invalid cart')
    lines = body.lines.map((l: Record<string, unknown>) => ({
      slug: String(l?.slug ?? ''),
      color: String(l?.color ?? ''),
      size: String(l?.size ?? ''),
      qty: Number(l?.qty),
    }))
  } catch {
    return fail(400, 'Invalid cart')
  }

  const priced = priceCart(lines, await loadActiveProducts(db, store.accountId))
  if (!priced.ok) return fail(400, priced.error)

  try {
    const session = await getStripe(loaded.secrets.stripeSecretKey).checkout.sessions.create({
      mode: 'payment',
      line_items: priced.items.map((i) => ({
        quantity: i.qty,
        price_data: {
          currency: 'usd',
          unit_amount: i.unit_cents,
          product_data: {
            name: `${i.product.name} — ${i.color} / ${i.size}`,
            // O webhook reconstrói o pedido daqui (listLineItems), não do navegador.
            metadata: { slug: i.product.slug, color: i.color, size: i.size },
            ...(i.product.image_url ? { images: [i.product.image_url] } : {}),
          },
        },
      })),
      shipping_address_collection: { allowed_countries: ['US'] },
      phone_number_collection: { enabled: true },
      metadata: { account_id: store.accountId },
      success_url: `${siteUrl}?checkout=success`,
      cancel_url: `${siteUrl}?checkout=cancel`,
    })
    return NextResponse.json({ url: session.url }, { headers })
  } catch (err) {
    console.error('[loja/checkout] stripe error:', err)
    return fail(502, 'payment_provider_error')
  }
}
