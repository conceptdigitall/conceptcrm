import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/store/admin-client'

/**
 * GET /api/loja/cron/retention — cron diário da Vercel (vercel.json).
 * Apaga eventos do site com mais de 13 meses. A Vercel manda
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? ''
  const got = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (!secret || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { data, error } = await supabaseAdmin().rpc('store_purge_old_events')
  if (error) {
    console.error('[loja/cron/retention] failed:', error.message)
    return NextResponse.json({ error: 'purge_failed' }, { status: 500 })
  }
  return NextResponse.json({ deleted: data ?? 0 })
}
