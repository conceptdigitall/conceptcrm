-- ============================================================
-- 048_fix_appointments_rls.sql
-- Fix Multi-Tenant Isolation in Appointments RLS
-- ============================================================

-- 1. Defensive backfill: ensure all existing appointments have account_id set
UPDATE appointments a
SET account_id = c.account_id
FROM contacts c
WHERE a.account_id IS NULL AND a.contact_id = c.id AND c.account_id IS NOT NULL;

UPDATE appointments a
SET account_id = p.account_id
FROM profiles p
WHERE a.account_id IS NULL AND a.user_id = p.user_id AND p.account_id IS NOT NULL;

-- 2. Ensure trigger reliably sets account_id before insert
CREATE OR REPLACE FUNCTION set_appointment_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT account_id, user_id INTO NEW.account_id, NEW.user_id
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;
  IF NEW.account_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT account_id INTO NEW.account_id
    FROM profiles
    WHERE user_id = auth.uid();
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Replace loose RLS policies that had `OR auth.uid() = user_id`
-- All access now strictly enforces multi-tenant account isolation.

DROP POLICY IF EXISTS appointments_select ON appointments;
CREATE POLICY appointments_select ON appointments FOR SELECT
  USING (
    account_id IS NOT NULL AND is_account_member(account_id)
  );

DROP POLICY IF EXISTS appointments_insert ON appointments;
CREATE POLICY appointments_insert ON appointments FOR INSERT
  WITH CHECK (
    account_id IS NOT NULL AND is_account_member(account_id, 'agent')
  );

DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_update ON appointments FOR UPDATE
  USING (
    account_id IS NOT NULL AND is_account_member(account_id, 'agent')
  );

DROP POLICY IF EXISTS appointments_delete ON appointments;
CREATE POLICY appointments_delete ON appointments FOR DELETE
  USING (
    account_id IS NOT NULL AND is_account_member(account_id, 'agent')
  );
