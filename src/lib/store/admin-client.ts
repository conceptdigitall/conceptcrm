import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente service-role do módulo Loja (checkout, webhooks, track, chaves).
// Mesmo padrão de src/lib/ai/admin-client.ts. Sempre filtrar por account_id.
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}
