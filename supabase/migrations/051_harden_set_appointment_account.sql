-- 051_harden_set_appointment_account.sql
-- Fix lint 0028/0029 (SECURITY DEFINER executable via /rest/v1/rpc) and lint 0011 (search_path mutable)
-- Only affects public.set_appointment_account (CRM Concept)

ALTER FUNCTION public.set_appointment_account() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.set_appointment_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_appointment_account() TO service_role;
