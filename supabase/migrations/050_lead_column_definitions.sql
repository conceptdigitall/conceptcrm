-- ============================================================
-- 050_lead_column_definitions.sql — Planilha Preditiva: definições
-- por opção para orientar Laya e o árbitro Claude com precisão máxima.
-- Aditiva e idempotente.
-- ============================================================

-- Campo de definições das opções na coluna (armazenado em formato JSON string)
ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS definition TEXT;

-- Permite 'regra' como fonte na decisão da célula (ex: regra geográfica de Santos)
ALTER TABLE lead_column_values DROP CONSTRAINT IF EXISTS lead_column_values_source_check;
ALTER TABLE lead_column_values ADD CONSTRAINT lead_column_values_source_check
  CHECK (source IS NULL OR source IN ('laya','cabeca','claude','regra'));
