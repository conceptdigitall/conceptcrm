import { NextResponse } from 'next/server'
import { deploymentAccountId } from '@/lib/deployment-account'
import { isStoreAccount } from '@/lib/store-accounts'

/**
 * Loja deste deploy para as rotas públicas (checkout, webhooks, track).
 * Um CRM por loja: a conta é sempre a do CRM_ACCOUNT_ID.
 */
export function publicStoreAccount(): { accountId: string } | NextResponse {
  const accountId = deploymentAccountId()
  if (!accountId) return NextResponse.json({ error: 'store_not_configured' }, { status: 503 })
  if (!isStoreAccount(accountId)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return { accountId }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/** CORS só para o site da própria loja. */
export function corsHeaders(siteUrl: string | null, origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (siteUrl && origin && sameOrigin(siteUrl, origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
    headers['Access-Control-Max-Age'] = '600'
  }
  return headers
}
