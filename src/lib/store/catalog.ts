import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoreProduct } from './types'

export const PRODUCT_COLUMNS = 'id, slug, name, price_cents, colors, sizes, weight_oz, image_url, active'

export async function loadActiveProducts(db: SupabaseClient, accountId: string): Promise<StoreProduct[]> {
  const { data, error } = await db
    .from('store_products')
    .select(PRODUCT_COLUMNS)
    .eq('account_id', accountId)
    .eq('active', true)
  if (error) throw new Error(`store_products: ${error.message}`)
  return (data ?? []).map((p) => ({ ...p, weight_oz: Number(p.weight_oz) })) as StoreProduct[]
}
