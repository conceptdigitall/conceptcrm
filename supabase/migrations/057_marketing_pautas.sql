-- Migration 057: Pauta semanal de marketing (aprovação item a item pelo celular)
CREATE TABLE IF NOT EXISTS marketing_pautas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  semana_inicio DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'gerando' CHECK (status IN ('gerando','pending_approval','fechada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, semana_inicio)
);

CREATE TABLE IF NOT EXISTS marketing_pauta_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pauta_id UUID NOT NULL REFERENCES marketing_pautas(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  dia DATE NOT NULL,
  formato TEXT NOT NULL CHECK (formato IN ('feed','story','reel')),
  tema TEXT NOT NULL DEFAULT '',
  gancho TEXT NOT NULL DEFAULT '',
  roteiro TEXT NOT NULL DEFAULT '',
  legenda_base TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','aprovado','ajuste','recusado')),
  comentario TEXT,
  versao INT NOT NULL DEFAULT 1,
  post_id UUID REFERENCES marketing_posts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_pauta_itens_pauta ON marketing_pauta_itens(pauta_id);
CREATE INDEX IF NOT EXISTS idx_marketing_pauta_itens_account_status ON marketing_pauta_itens(account_id, status);

ALTER TABLE marketing_pautas ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_pauta_itens ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_pautas','marketing_pauta_itens'] LOOP
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
