// Criação de referência compartilhada pela rota do painel e pela API v1:
// insere como `pending` e, se o link já existe na conta (23505), devolve a existente.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketingReference } from '@/types';
import type { validateReferenceInput } from '@/lib/marketing/references';

type ReferenceValue = Extract<ReturnType<typeof validateReferenceInput>, { ok: true }>['value'];

export type CreateReferenceResult =
  | { ok: true; reference: MarketingReference; duplicate: boolean }
  | { ok: false; error: unknown };

export async function createReference(
  db: SupabaseClient,
  accountId: string,
  userId: string | null,
  value: ReferenceValue
): Promise<CreateReferenceResult> {
  const { url, normalized, platform, eixo, nicho, views } = value;
  const { data, error } = await db
    .from('marketing_references')
    .insert({
      account_id: accountId,
      url,
      url_normalizada: normalized,
      plataforma: platform,
      eixo,
      nicho,
      views,
      status: 'pending',
      criado_por: userId,
    })
    .select()
    .single();

  if (!error) return { ok: true, reference: data as MarketingReference, duplicate: false };
  if ((error as { code?: string }).code !== '23505') return { ok: false, error };

  const { data: existing, error: findErr } = await db
    .from('marketing_references')
    .select('*')
    .eq('account_id', accountId)
    .eq('url_normalizada', normalized)
    .maybeSingle();
  if (findErr || !existing) return { ok: false, error: findErr ?? error };
  return { ok: true, reference: existing as MarketingReference, duplicate: true };
}
