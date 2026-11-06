import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/whatsapp/encryption'
import type { Address, Box } from './types'

export type StoreSecrets = {
  stripeSecretKey: string | null
  stripeWebhookSecret: string | null
  shippoApiKey: string | null
  shippoWebhookToken: string | null
  resendApiKey: string | null
}

export type StoreSettings = {
  accountId: string
  storeName: string
  orderPrefix: string
  siteUrl: string | null
  senderAddress: Address | null
  box: Box | null
  emailFrom: string | null
  reviewUrl: string | null
}

const SECRET_COLUMNS: Record<keyof StoreSecrets, string> = {
  stripeSecretKey: 'stripe_secret_key_enc',
  stripeWebhookSecret: 'stripe_webhook_secret_enc',
  shippoApiKey: 'shippo_api_key_enc',
  shippoWebhookToken: 'shippo_webhook_token_enc',
  resendApiKey: 'resend_api_key_enc',
}

function safeDecrypt(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    return decrypt(value)
  } catch {
    return null
  }
}

/** Configurações + chaves decifradas. `db` precisa ser o cliente service-role. */
export async function loadStoreSettings(
  db: SupabaseClient,
  accountId: string,
): Promise<{ settings: StoreSettings; secrets: StoreSecrets } | null> {
  const [{ data: s }, { data: k }] = await Promise.all([
    db.from('store_settings').select('*').eq('account_id', accountId).maybeSingle(),
    db.from('store_secrets').select('*').eq('account_id', accountId).maybeSingle(),
  ])
  if (!s) return null

  const secrets = Object.fromEntries(
    Object.entries(SECRET_COLUMNS).map(([key, col]) => [key, safeDecrypt(k?.[col])]),
  ) as StoreSecrets

  return {
    settings: {
      accountId,
      storeName: s.store_name,
      orderPrefix: s.order_prefix,
      siteUrl: s.site_url ?? null,
      senderAddress: s.sender_address ?? null,
      box: s.box ?? null,
      emailFrom: s.email_from ?? null,
      reviewUrl: s.review_url ?? null,
    },
    secrets,
  }
}

/** Grava só as chaves não vazias; as demais ficam como estão. */
export async function saveStoreSecrets(
  db: SupabaseClient,
  accountId: string,
  input: Partial<Record<keyof StoreSecrets, string | null | undefined>>,
): Promise<void> {
  const row: Record<string, string> = {}
  for (const [key, col] of Object.entries(SECRET_COLUMNS)) {
    const v = input[key as keyof StoreSecrets]
    if (typeof v === 'string' && v.trim()) row[col] = encrypt(v.trim())
  }
  if (Object.keys(row).length === 0) return
  const { error } = await db
    .from('store_secrets')
    .upsert({ account_id: accountId, ...row, updated_at: new Date().toISOString() }, { onConflict: 'account_id' })
  if (error) throw new Error(`store_secrets: ${error.message}`)
}

/** Quais chaves existem, sem expor nenhuma. */
export function secretFlags(secrets: StoreSecrets | null) {
  return {
    hasStripeKey: Boolean(secrets?.stripeSecretKey),
    hasStripeWebhookSecret: Boolean(secrets?.stripeWebhookSecret),
    hasShippoKey: Boolean(secrets?.shippoApiKey),
    hasShippoWebhookToken: Boolean(secrets?.shippoWebhookToken),
    hasResendKey: Boolean(secrets?.resendApiKey),
  }
}
