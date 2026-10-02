-- ============================================================
-- 047_lead_column_learning.sql — Planilha Preditiva, parte B: cada coluna de
-- IA aprende com os exemplos dela (respostas do Claude e correções do João).
-- Ver docs/superpowers/specs/2026-10-01-planilha-preditiva-parte-b-design.md.
-- Aditiva e idempotente.
-- ============================================================

-- Quem decidiu cada célula e o palpite do modelo base (para medir a cabeça contra ele).
ALTER TABLE lead_column_values ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE lead_column_values ADD COLUMN IF NOT EXISTS laya_value TEXT;
ALTER TABLE lead_column_values DROP CONSTRAINT IF EXISTS lead_column_values_source_check;
ALTER TABLE lead_column_values ADD CONSTRAINT lead_column_values_source_check
  CHECK (source IS NULL OR source IN ('laya','cabeca','claude'));

-- Resumo do aprendizado, lido pela tela junto com a coluna.
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS teach_requested_at TIMESTAMPTZ;
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS taught_at TIMESTAMPTZ;
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS examples_count INTEGER;
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS head_accuracy REAL;
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS base_accuracy REAL;
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS head_coverage REAL;
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS trained_at TIMESTAMPTZ;
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS claude_calls INTEGER;
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS head_decisions INTEGER;

-- A cabeça em uso (pesos da regressão logística). Só o worker lê e escreve.
CREATE TABLE IF NOT EXISTS lead_column_heads (
  column_id UUID PRIMARY KEY REFERENCES lead_columns(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  labels TEXT[] NOT NULL,
  weights JSONB NOT NULL,
  bias REAL[] NOT NULL,
  mu REAL[] NOT NULL,
  sd REAL[] NOT NULL,
  threshold REAL NOT NULL CHECK (threshold BETWEEN 0 AND 1),
  trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vetor de cada lead (média do codificador da Laya); recalculado quando o texto muda.
CREATE TABLE IF NOT EXISTS lead_embeddings (
  lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  vector REAL[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_embeddings_account ON lead_embeddings(account_id);

-- Pesos e vetores não aparecem na tela: membros só leem; escrita é do worker (service role).
ALTER TABLE lead_column_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_embeddings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_column_heads','lead_embeddings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON %1$s FOR SELECT USING (is_account_member(account_id))', t);
  END LOOP;
END $$;
