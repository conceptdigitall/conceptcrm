-- ============================================================
-- 062_client_contracts.sql — Gestão de Documentos e Contratos
-- ============================================================

CREATE TABLE IF NOT EXISTS client_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Contrato de Prestação de Serviços Digitais',
  type TEXT NOT NULL DEFAULT 'avulso' CHECK (type IN ('recorrente', 'avulso')),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado', 'assinado', 'cancelado')),
  setup_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  monthly_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  billing_day INTEGER CHECK (billing_day >= 1 AND billing_day <= 31),
  document_url TEXT,
  signed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_account_id ON client_contracts(account_id);
CREATE INDEX IF NOT EXISTS idx_contracts_contact_id ON client_contracts(contact_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON client_contracts(status);

-- RLS
ALTER TABLE client_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contracts_select ON client_contracts;
CREATE POLICY contracts_select ON client_contracts FOR SELECT
  USING (
    (account_id IS NOT NULL AND is_account_member(account_id))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = client_contracts.contact_id AND is_account_member(c.account_id)
    ))
    OR (auth.uid() = user_id)
  );

DROP POLICY IF EXISTS contracts_insert ON client_contracts;
CREATE POLICY contracts_insert ON client_contracts FOR INSERT
  WITH CHECK (
    (account_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = client_contracts.contact_id AND is_account_member(c.account_id, 'agent')
    ))
    OR (auth.uid() = user_id)
  );

DROP POLICY IF EXISTS contracts_update ON client_contracts;
CREATE POLICY contracts_update ON client_contracts FOR UPDATE
  USING (
    (account_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = client_contracts.contact_id AND is_account_member(c.account_id, 'agent')
    ))
    OR (auth.uid() = user_id)
  );

DROP POLICY IF EXISTS contracts_delete ON client_contracts;
CREATE POLICY contracts_delete ON client_contracts FOR DELETE
  USING (
    (account_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = client_contracts.contact_id AND is_account_member(c.account_id, 'agent')
    ))
    OR (auth.uid() = user_id)
  );
