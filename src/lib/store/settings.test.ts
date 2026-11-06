import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/whatsapp/encryption', () => ({
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\((.*)\)$/, '$1'),
}))

import { loadStoreSettings, saveStoreSecrets } from './settings'
import { fakeDb } from './test-db'

const ACC = 'acc-1'

describe('store settings', () => {
  it('returns null when the store was never configured', async () => {
    const db = fakeDb({})
    expect(await loadStoreSettings(db as never, ACC)).toBeNull()
  })

  it('decrypts secrets and maps settings', async () => {
    const db = fakeDb({
      store_settings: [{ account_id: ACC, store_name: 'Essence Wear', order_prefix: 'EW', site_url: 'https://shop.test', sender_address: null, box: null, email_from: null, review_url: null }],
      store_secrets: [{ account_id: ACC, stripe_secret_key_enc: 'enc(sk_test_1)', stripe_webhook_secret_enc: null, shippo_api_key_enc: null, shippo_webhook_token_enc: null, resend_api_key_enc: null }],
    })
    const r = await loadStoreSettings(db as never, ACC)
    expect(r?.settings).toMatchObject({ storeName: 'Essence Wear', orderPrefix: 'EW', siteUrl: 'https://shop.test', emailFrom: null })
    expect(r?.secrets.stripeSecretKey).toBe('sk_test_1')
    expect(r?.secrets.shippoApiKey).toBeNull()
  })

  it('encrypts only non-empty secrets and keeps the others', async () => {
    const db = fakeDb({ store_secrets: [{ account_id: ACC, stripe_secret_key_enc: 'enc(old)', shippo_api_key_enc: 'enc(keep)' }] })
    await saveStoreSecrets(db as never, ACC, { stripeSecretKey: 'sk_new', shippoApiKey: '' })
    const row = db.tables.store_secrets[0]
    expect(row.stripe_secret_key_enc).toBe('enc(sk_new)')
    expect(row.shippo_api_key_enc).toBe('enc(keep)')
  })
})
