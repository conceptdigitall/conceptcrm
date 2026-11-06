import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole } from '@/lib/auth/account'
import type { AccountRole } from '@/lib/auth/roles'
import { isStoreAccount } from '@/lib/store-accounts'

export class NotStoreAccountError extends Error {
  status = 404
}

/** Conta logada, só se for loja; com `min`, exige o papel mínimo. */
export async function storeAccount(min?: AccountRole) {
  const ctx = min ? await requireRole(min) : await getCurrentAccount()
  if (!isStoreAccount(ctx.accountId)) throw new NotStoreAccountError('not a store account')
  return ctx
}

export function storeErrorResponse(err: unknown, fallback: (e: unknown) => Response): Response {
  if (err instanceof NotStoreAccountError) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return fallback(err)
}
