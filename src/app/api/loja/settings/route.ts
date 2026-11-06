import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { loadStoreSettings, saveStoreSecrets, secretFlags } from '@/lib/store/settings'

const str = (v: unknown, max = 500) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)

/** GET /api/loja/settings — configurações e quais chaves existem (membros). */
export async function GET() {
  try {
    const { accountId } = await storeAccount()
    const loaded = await loadStoreSettings(supabaseAdmin(), accountId)
    return NextResponse.json({
      settings: loaded?.settings ?? null,
      flags: secretFlags(loaded?.secrets ?? null),
    })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}

/** PUT /api/loja/settings — admin. Chave vazia = mantém a atual. */
export async function PUT(request: Request) {
  try {
    const { accountId } = await storeAccount('admin')
    const body = await request.json().catch(() => null)
    const storeName = str(body?.storeName, 120)
    if (!storeName) return NextResponse.json({ error: 'Store name is required' }, { status: 400 })

    const prefix = (str(body?.orderPrefix, 6) ?? 'EW').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'EW'
    const db = supabaseAdmin()
    const { error } = await db.from('store_settings').upsert(
      {
        account_id: accountId,
        store_name: storeName,
        order_prefix: prefix,
        site_url: str(body?.siteUrl),
        sender_address: obj(body?.senderAddress),
        box: obj(body?.box),
        email_from: str(body?.emailFrom, 200),
        review_url: str(body?.reviewUrl),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' },
    )
    if (error) {
      console.error('[loja/settings PUT] error:', error)
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }
    await saveStoreSecrets(db, accountId, obj(body?.secrets) ?? {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return storeErrorResponse(err, toErrorResponse)
  }
}
