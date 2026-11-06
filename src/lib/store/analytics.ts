import type { SupabaseClient } from '@supabase/supabase-js'

export type ProductStat = { slug: string; views: number; spins: number; adds: number; sold_qty: number }
export type Count = { value: string; count: number }
export type Pick = { value: string; picks: number; sold: number }

export type StoreAnalytics = {
  visits: number
  unique_visitors: number
  avg_session_seconds: number
  orders: number
  revenue_cents: number
  funnel: { visited: number; product_view: number; add_to_cart: number; checkout_start: number; paid: number }
  products: ProductStat[]
  colors: Pick[]
  sizes: Pick[]
  sources: Count[]
  devices: Count[]
  regions: Count[]
  daily: { day: string; visits: number }[]
}

export type AnalyticsDays = 7 | 30 | 90
const DAY_MS = 86_400_000

/** Período pedido + o período anterior do mesmo tamanho (para comparar). */
export async function loadStoreAnalytics(
  db: SupabaseClient,
  accountId: string,
  days: AnalyticsDays,
): Promise<{ current: StoreAnalytics; previous: StoreAnalytics }> {
  const now = Date.now()
  const span = days * DAY_MS
  const call = async (from: number, to: number) => {
    const { data, error } = await db.rpc('store_analytics', {
      p_account: accountId,
      p_from: new Date(from).toISOString(),
      p_to: new Date(to).toISOString(),
    })
    if (error) throw new Error(error.message)
    return data as StoreAnalytics
  }
  const current = await call(now - span, now)
  const previous = await call(now - 2 * span, now - span)
  return { current, previous }
}

/** Muito vista, pouco vendida: ≥ 20 visualizações e < 2% de conversão. */
export function lowConversion(products: ProductStat[]): ProductStat[] {
  return products
    .filter((p) => p.views >= 20 && p.sold_qty / p.views < 0.02)
    .sort((a, b) => b.views - a.views)
}

/** Variação % contra o período anterior; null quando não há base. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}
