-- ============================================================
-- 045_lead_columns.sql — Planilha Preditiva: colunas de IA sobre os
-- leads da Prospecção, preenchidas pelo worker local com o Laya.
-- Ferramenta interna da Concept. Aditiva e idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  kind TEXT NOT NULL CHECK (kind IN ('noul','choice','score')),
  options TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(options) <= 8),
  instructions TEXT NOT NULL CHECK (char_length(instructions) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  error TEXT,
  model TEXT,
  filled_count INTEGER,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_columns_queue ON lead_columns(status, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_columns_account ON lead_columns(account_id, created_at);

CREATE TABLE IF NOT EXISTS lead_column_values (
  column_id UUID NOT NULL REFERENCES lead_columns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  value TEXT,
  confidence NUMERIC(4,3) CHECK (confidence BETWEEN 0 AND 1),
  corrected_value TEXT,
  corrected_by UUID,
  corrected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (column_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_column_values_lead ON lead_column_values(lead_id);

-- The value's account always comes from its column, and the lead must belong
-- to that same account. Runs before RLS WITH CHECK, so an agent of account A
-- cannot attach rows to account B's column or leads.
CREATE OR REPLACE FUNCTION lead_column_values_same_account() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT account_id INTO NEW.account_id FROM lead_columns WHERE id = NEW.column_id;
  IF NEW.account_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM leads WHERE id = NEW.lead_id AND account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'lead_column_values: coluna e lead precisam ser da mesma conta'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_column_values_same_account ON lead_column_values;
CREATE TRIGGER trg_lead_column_values_same_account
  BEFORE INSERT OR UPDATE ON lead_column_values
  FOR EACH ROW EXECUTE FUNCTION lead_column_values_same_account();

ALTER TABLE lead_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_column_values ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_columns','lead_column_values'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON %1$s FOR SELECT USING (is_account_member(account_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON %1$s FOR INSERT WITH CHECK (is_account_member(account_id, ''agent''))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_update ON %1$s FOR UPDATE USING (is_account_member(account_id, ''agent'')) WITH CHECK (is_account_member(account_id, ''agent''))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_delete ON %1$s FOR DELETE USING (is_account_member(account_id, ''agent''))', t);
  END LOOP;
END $$;
