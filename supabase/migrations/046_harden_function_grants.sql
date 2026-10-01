-- 046_harden_function_grants.sql
-- Aplicada com sucesso no projeto pkvlnhfzhjjsblotzoxn em 2026-09-30.
--
-- Fecha os lints 0028/0029 (SECURITY DEFINER executável via /rest/v1/rpc)
-- e 0011 (search_path mutável) no schema public. Não toca em ftv.
--
-- Por que REVOKE ... FROM PUBLIC: no Postgres toda função nasce com
-- EXECUTE para PUBLIC, e anon/authenticated herdam dali. Revogar só de
-- anon não resolve enquanto o grant de PUBLIC existir.
--
-- Triggers não checam EXECUTE ao disparar (só no CREATE TRIGGER), e
-- funções chamadas de dentro de um SECURITY DEFINER rodam como o dono
-- (postgres). Então revogar tudo das funções de trigger é seguro.

BEGIN;

-- ── 1. Só trigger / helper interno: ninguém da API chama ───────────
REVOKE EXECUTE ON FUNCTION public.broadcast_recipient_aggregate_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_conversation_assigned()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._bcast_bump(uuid, text, integer)        FROM PUBLIC, anon, authenticated;

-- ── 2. Código morto: referenciam tabelas/colunas que não existem ───
-- (memberships, pipeline_stages.organization_id, deals.organization_id;
-- nenhuma trigger ligada). Candidatas a DROP numa migração futura.
-- Só existem no banco de produção (criadas fora das migrações); num banco limpo
-- não há o que revogar, então cada REVOKE roda apenas se a função existir.
DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.check_deal_stage_same_org()',
    'public.seed_default_pipeline()',
    'public.has_role_in(uuid, text[])'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
    END IF;
  END LOOP;
END $$;

-- ── 3. Só servidor (supabaseAdmin / manutenção) ────────────────────
REVOKE EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_webhook_failure(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_broadcast_counts(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_duplicate_contacts()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_duplicate_conversations()       FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer)    TO service_role;
GRANT  EXECUTE ON FUNCTION public.record_webhook_failure(uuid, integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.recompute_broadcast_counts(uuid)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.merge_duplicate_contacts()            TO service_role;
GRANT  EXECUTE ON FUNCTION public.merge_duplicate_conversations()       TO service_role;

-- ── 4. RPCs de usuário logado (checam auth.uid() + papel por dentro) ─
REVOKE EXECUTE ON FUNCTION public.redeem_invitation(text)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_account_member(uuid)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_role(uuid, public.account_role_enum)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_presence(text)                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_account_ownership(uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_account_member(uuid, public.account_role_enum)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.redeem_invitation(text)                               TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.remove_account_member(uuid)                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.set_member_role(uuid, public.account_role_enum)       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.touch_presence(text)                                  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.transfer_account_ownership(uuid)                      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_account_member(uuid, public.account_role_enum)     TO authenticated, service_role;

-- ── 5. Públicas de propósito (ficam com anon; lint aceito) ─────────
-- peek_invitation(text)          — página /join antes do login, token com hash + rate limit.
-- track_page_view_update(...)    — analytics do site do Portfolio (chave anon), só aumenta 2 campos.
-- Nada a fazer aqui.

-- ── 6. search_path fixo nas 5 funções public sinalizadas (0011) ────
-- Corpos só usam pg_catalog (now(), arrays) → '' é seguro.
ALTER FUNCTION public.update_updated_at_column()                 SET search_path = '';
ALTER FUNCTION public.update_ai_configs_updated_at()             SET search_path = '';
ALTER FUNCTION public.update_ai_knowledge_documents_updated_at() SET search_path = '';
ALTER FUNCTION public._bcast_cols_for_status(text)               SET search_path = '';

-- set_appointment_account lê `contacts` sem schema → qualifica antes de travar.
CREATE OR REPLACE FUNCTION public.set_appointment_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.account_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT account_id, user_id INTO NEW.account_id, NEW.user_id
    FROM public.contacts
    WHERE id = NEW.contact_id;
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
