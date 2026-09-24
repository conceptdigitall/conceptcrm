-- ============================================================
-- 043_appointments.sql — Module of Appointments (Agendamentos)
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Sessão de Diagnóstico & Demonstração',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  meeting_url TEXT DEFAULT 'https://meet.google.com/new',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_account_id ON appointments(account_id);

-- Auto-fill account_id & user_id from contact if not explicitly supplied
CREATE OR REPLACE FUNCTION set_appointment_account()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT account_id, user_id INTO NEW.account_id, NEW.user_id
    FROM contacts
    WHERE id = NEW.contact_id;
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_appointment_account ON appointments;
CREATE TRIGGER trg_set_appointment_account
BEFORE INSERT ON appointments
FOR EACH ROW
EXECUTE FUNCTION set_appointment_account();

-- Enable Row Level Security
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON appointments;
CREATE POLICY appointments_select ON appointments FOR SELECT
  USING (
    (account_id IS NOT NULL AND is_account_member(account_id))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = appointments.contact_id AND is_account_member(c.account_id)
    ))
    OR (auth.uid() = user_id)
  );

DROP POLICY IF EXISTS appointments_insert ON appointments;
CREATE POLICY appointments_insert ON appointments FOR INSERT
  WITH CHECK (
    (account_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = appointments.contact_id AND is_account_member(c.account_id, 'agent')
    ))
    OR (auth.uid() = user_id)
  );

DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_update ON appointments FOR UPDATE
  USING (
    (account_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = appointments.contact_id AND is_account_member(c.account_id, 'agent')
    ))
    OR (auth.uid() = user_id)
  );

DROP POLICY IF EXISTS appointments_delete ON appointments;
CREATE POLICY appointments_delete ON appointments FOR DELETE
  USING (
    (account_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = appointments.contact_id AND is_account_member(c.account_id, 'agent')
    ))
    OR (auth.uid() = user_id)
  );
