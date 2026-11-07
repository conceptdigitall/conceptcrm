-- Migration 061: Radar de virais (referências analisadas pelo worker) + playbook e inspiração na pauta
CREATE TABLE IF NOT EXISTS marketing_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  url_normalizada TEXT NOT NULL,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('instagram','tiktok')),
  eixo TEXT NOT NULL CHECK (eixo IN ('como_falar','sobre_o_que')),
  nicho TEXT,
  views BIGINT,
  arquivo_path TEXT, -- só quando o vídeo foi enviado; zerado após a análise
  -- Mesmos nomes da fila do worker (worker/queue.ts)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  retry_after TIMESTAMPTZ, -- 429 do Gemini
  analise JSONB,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, url_normalizada)
);

CREATE INDEX IF NOT EXISTS idx_marketing_references_account_status
  ON marketing_references(account_id, status, created_at);

ALTER TABLE marketing_references ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_references'] LOOP
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

ALTER TABLE marketing_pautas ADD COLUMN IF NOT EXISTS playbook JSONB;

ALTER TABLE marketing_pauta_itens
  ADD COLUMN IF NOT EXISTS referencia_id UUID REFERENCES marketing_references(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspiracao TEXT;

-- formato passa a aceitar 'carrossel' (nome padrão do Postgres para a CHECK inline da 057)
ALTER TABLE marketing_pauta_itens DROP CONSTRAINT IF EXISTS marketing_pauta_itens_formato_check;
ALTER TABLE marketing_pauta_itens
  ADD CONSTRAINT marketing_pauta_itens_formato_check CHECK (formato IN ('feed','story','reel','carrossel'));
