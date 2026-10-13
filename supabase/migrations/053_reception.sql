-- ============================================================
-- 053_reception.sql — Recepcionista de IA (funil fase 1)
-- Escrita só pelo service role; membros da conta só leem.
-- ============================================================

CREATE TABLE IF NOT EXISTS reception_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  pipeline_id UUID REFERENCES pipelines(id),
  stage_ids JSONB NOT NULL DEFAULT '{}',
  plans_url TEXT NOT NULL DEFAULT '',
  last_health_alert_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reception_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'nicho'
    CHECK (stage IN ('nicho','interesse','momento','urgencia','agendando','concluida','humano')),
  answers JSONB NOT NULL DEFAULT '{}',
  unclear_count INT NOT NULL DEFAULT 0,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('quente','morno','frio','humano')),
  score INT,
  origin TEXT NOT NULL DEFAULT 'direto',
  offered_slots JSONB NOT NULL DEFAULT '[]',
  slot_rounds INT NOT NULL DEFAULT 0,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  -- watchdog do cron: lead quente em concluida sem reunião já avisado ao João
  alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reception_sessions_account_id ON reception_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_reception_sessions_contact_id ON reception_sessions(contact_id);

CREATE TABLE IF NOT EXISTS reception_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('lembrete','followup')),
  run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts INT NOT NULL DEFAULT 0,
  session_id UUID REFERENCES reception_sessions(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reception_jobs_status_run_at ON reception_jobs(status, run_at);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

-- RLS: somente SELECT para membros; escrita via service role (bypassa RLS)
ALTER TABLE reception_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reception_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reception_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reception_settings_select ON reception_settings;
CREATE POLICY reception_settings_select ON reception_settings FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS reception_sessions_select ON reception_sessions;
CREATE POLICY reception_sessions_select ON reception_sessions FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS reception_jobs_select ON reception_jobs;
CREATE POLICY reception_jobs_select ON reception_jobs FOR SELECT
  USING (is_account_member(account_id));
