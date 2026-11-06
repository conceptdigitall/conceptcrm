import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { loadStoreAnalytics, type AnalyticsDays } from '@/lib/store/analytics'

/**
 * GET /api/loja/analytics?days=7|30|90 — usa o cliente do usuário logado,
 * então o RLS de store_events/orders garante que só a própria loja aparece.
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await storeAccount()
    const raw = Number(new URL(request.url).searchParams.get('days'))
    const days: AnalyticsDays = raw === 7 || raw === 90 ? raw : 30
    return NextResponse.json({ days, ...(await loadStoreAnalytics(supabase, accountId, days)) })
  } catch (err) {
    if (err instanceof Error && !('status' in err)) {
      console.error('[loja/analytics] failed:', err.message)
      return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
    }
    return storeErrorResponse(err, toErrorResponse)
  }
}
