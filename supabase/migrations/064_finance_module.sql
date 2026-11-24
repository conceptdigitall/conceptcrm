-- ============================================================
-- 064_finance_module.sql — Módulo Financeiro (aba interna da Concept)
--
-- Lançamentos de receita/despesa, cobranças geradas a partir dos contratos
-- recorrentes (062) e uma configuração por conta para o painel do Simples
-- Nacional. Tudo isolado por account_id com RLS; só admin/owner da conta
-- lê ou escreve (dado financeiro). Valores em centavos (INTEGER).
-- A aba só aparece para contas em NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS.
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('receita', 'despesa')),
  category TEXT NOT NULL DEFAULT 'outros',
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'contrato')),
  reference_month DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- pago exige data de pagamento; pendente/cancelado não pode ter
  CONSTRAINT finance_entries_paid_consistent CHECK (
    (status = 'pago' AND paid_at IS NOT NULL) OR (status <> 'pago' AND paid_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_account_due ON finance_entries(account_id, due_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_account_kind ON finance_entries(account_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_finance_entries_contact ON finance_entries(contact_id);

-- Idempotência da geração mensal: uma cobrança por contrato, mês e categoria.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_entries_contract_month
  ON finance_entries(contract_id, reference_month, category)
  WHERE source = 'contrato';

DROP TRIGGER IF EXISTS set_updated_at ON finance_entries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Configuração por conta. A alíquota efetiva do Simples vem do contador
-- (a Receita ainda não publicou as alíquotas efetivas; PGDAS-D, Release 16).
CREATE TABLE IF NOT EXISTS finance_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  simples_aliquota_percent NUMERIC(5, 2)
    CHECK (simples_aliquota_percent IS NULL OR (simples_aliquota_percent >= 0 AND simples_aliquota_percent <= 100)),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at ON finance_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- RLS: só admin/owner da conta
-- ------------------------------------------------------------
ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_entries_select ON finance_entries;
CREATE POLICY finance_entries_select ON finance_entries FOR SELECT
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS finance_entries_insert ON finance_entries;
CREATE POLICY finance_entries_insert ON finance_entries FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'admin')
    AND (contact_id IS NULL OR EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = contact_id AND c.account_id = finance_entries.account_id))
    AND (contract_id IS NULL OR EXISTS (
      SELECT 1 FROM client_contracts k WHERE k.id = contract_id AND k.account_id = finance_entries.account_id))
  );

DROP POLICY IF EXISTS finance_entries_update ON finance_entries;
CREATE POLICY finance_entries_update ON finance_entries FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (
    is_account_member(account_id, 'admin')
    AND (contact_id IS NULL OR EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = contact_id AND c.account_id = finance_entries.account_id))
    AND (contract_id IS NULL OR EXISTS (
      SELECT 1 FROM client_contracts k WHERE k.id = contract_id AND k.account_id = finance_entries.account_id))
  );

DROP POLICY IF EXISTS finance_entries_delete ON finance_entries;
CREATE POLICY finance_entries_delete ON finance_entries FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS finance_settings_select ON finance_settings;
CREATE POLICY finance_settings_select ON finance_settings FOR SELECT
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS finance_settings_insert ON finance_settings;
CREATE POLICY finance_settings_insert ON finance_settings FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS finance_settings_update ON finance_settings;
CREATE POLICY finance_settings_update ON finance_settings FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ------------------------------------------------------------
-- Cobranças do mês a partir dos contratos recorrentes assinados.
-- SECURITY INVOKER (padrão): roda sob a RLS de quem chama, então só
-- admin da conta consegue gerar, e só para a própria conta.
-- Idempotente: reexecutar no mesmo mês não duplica.
-- Retorna quantas cobranças novas foram criadas.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_contract_receivables(
  p_account_id UUID,
  p_month DATE
) RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', p_month)::date;
  v_last_day INTEGER := EXTRACT(DAY FROM (v_month + INTERVAL '1 month - 1 day'))::integer;
  v_inserted INTEGER;
BEGIN
  IF NOT is_account_member(p_account_id, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO finance_entries (
    account_id, kind, category, description, amount_cents, due_date,
    contact_id, contract_id, source, reference_month, created_by
  )
  SELECT
    k.account_id, 'receita', 'mensalidade',
    'Mensalidade — ' || k.title,
    ROUND(k.monthly_price * 100)::integer,
    v_month + (LEAST(COALESCE(k.billing_day, 1), v_last_day) - 1),
    k.contact_id, k.id, 'contrato', v_month, auth.uid()
  FROM client_contracts k
  WHERE k.account_id = p_account_id
    AND k.type = 'recorrente'
    AND k.status = 'assinado'
    AND k.monthly_price > 0
    -- só a partir do mês da assinatura
    AND (k.signed_at IS NULL OR date_trunc('month', k.signed_at)::date <= v_month)
  ON CONFLICT (contract_id, reference_month, category) WHERE source = 'contrato' DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_contract_receivables(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_contract_receivables(UUID, DATE) TO authenticated, service_role;
