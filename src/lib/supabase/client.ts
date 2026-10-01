import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton instance — one client shared across the whole browser session.
// Creating multiple clients causes auth-lock contention ("Lock was released
// because another request stole it") and intermittent fetch failures.
let browserClient: SupabaseClient | undefined

export function createClient() {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    // Next.js prerenders static pages at build time (e.g. /forgot-password).
    // When building in an environment without Supabase env vars (such as Vercel Preview),
    // return a placeholder client so prerendering succeeds. Do not cache in browserClient.
    return createBrowserClient(
      url || 'https://placeholder.supabase.co',
      anonKey || 'placeholder-anon-key'
    )
  }

  browserClient = createBrowserClient(url, anonKey)

  return browserClient
}
