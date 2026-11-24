-- ============================================================
-- 065_finance_unified.sql — Módulo Financeiro unificado
--
-- Junta os dois desenhos do Financeiro:
--  * lançamentos em qualquer moeda com cotação para real, categorias
--    próprias e assinaturas/fixos (pacote financeiro-modulo);
--  * cobranças mensais geradas dos contratos recorrentes e painel do
--    Simples Nacional (064_finance_module).
--
-- A 064 criou finance_entries/finance_settings com outro formato e nunca
-- recebeu dados. Esta migration só as recria se continuarem VAZIAS; se
-- houver qualquer linha, aborta sem alterar nada.
--
-- Tudo separado por account_id. Leitura e escrita só para admin/owner da
-- conta. Valores em centavos inteiros.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.finance_entries') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.finance_entries) THEN
    RAISE EXCEPTION '065: finance_entries tem dados; migração manual necessária';
  END IF;
  IF to_regclass('public.finance_settings') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.finance_settings) THEN
    RAISE EXCEPTION '065: finance_settings tem dados; migração manual necessária';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.generate_contract_receivables(UUID, DATE);
DROP TABLE IF EXISTS public.finance_entries;
DROP TABLE IF EXISTS public.finance_settings;

-- ---------- Categorias ----------
CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  color TEXT NOT NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, kind, name)
);

-- ---------- Assinaturas e fixos ----------
CREATE TABLE IF NOT EXISTS finance_recurring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  cycle TEXT NOT NULL CHECK (cycle IN ('monthly', 'yearly')),
  next_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_recurring_account ON finance_recurring (account_id, next_date);

-- ---------- Lançamentos (o que efetivamente entrou ou saiu) ----------
CREATE TABLE IF NOT EXISTS finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  date DATE NOT NULL,
  -- Reais por 1 unidade da moeda, congelada no dia do lançamento.
  rate_to_brl NUMERIC(18, 8) NOT NULL CHECK (rate_to_brl > 0),
  rate_source TEXT NOT NULL CHECK (rate_source IN ('fixed', 'awesomeapi', 'frankfurter', 'manual')),
  rate_date DATE NOT NULL,
  amount_brl_cents BIGINT NOT NULL CHECK (amount_brl_cents >= 0),
  -- Valor real da fatura em reais (IOF/spread), quando informado.
  actual_brl_cents BIGINT CHECK (actual_brl_cents IS NULL OR actual_brl_cents > 0),
  recurring_id UUID REFERENCES finance_recurring(id) ON DELETE SET NULL,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_entries_account_date ON finance_entries (account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_entries_category ON finance_entries (category_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_recurring ON finance_entries (recurring_id);

-- ---------- Cobranças dos contratos (a receber) ----------
-- Uma por contrato e mês. Ao marcar como paga, vira um lançamento de entrada
-- (entry_id); reabrir apaga esse lançamento.
CREATE TABLE IF NOT EXISTS finance_receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  reference_month DATE NOT NULL CHECK (reference_month = date_trunc('month', reference_month)::date),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  paid_date DATE,
  entry_id UUID REFERENCES finance_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finance_receivables_paid_consistent CHECK (
    (status = 'pago' AND paid_date IS NOT NULL) OR (status <> 'pago' AND paid_date IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_receivables_contract_month
  ON finance_receivables (contract_id, reference_month);
CREATE INDEX IF NOT EXISTS idx_finance_receivables_account_month
  ON finance_receivables (account_id, reference_month);

DROP TRIGGER IF EXISTS set_updated_at ON finance_receivables;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance_receivables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- Configuração do painel do Simples ----------
-- A alíquota efetiva vem do contador; a categoria de folha é a base do Fator R.
CREATE TABLE IF NOT EXISTS finance_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  simples_aliquota_percent NUMERIC(5, 2)
    CHECK (simples_aliquota_percent IS NULL OR (simples_aliquota_percent >= 0 AND simples_aliquota_percent <= 100)),
  payroll_category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at ON finance_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- RLS: só admin/owner da conta ----------
ALTER TABLE finance_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_recurring   ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_settings    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_categories', 'finance_recurring', 'finance_entries', 'finance_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON %1$s FOR SELECT USING (is_account_member(account_id, ''admin''))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_write ON %1$s FOR ALL USING (is_account_member(account_id, ''admin'')) WITH CHECK (is_account_member(account_id, ''admin''))', t);
  END LOOP;
END $$;

-- Cobranças: contato e contrato precisam ser da mesma conta.
DROP POLICY IF EXISTS finance_receivables_select ON finance_receivables;
CREATE POLICY finance_receivables_select ON finance_receivables FOR SELECT
  USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS finance_receivables_write ON finance_receivables;
CREATE POLICY finance_receivables_write ON finance_receivables FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (
    is_account_member(account_id, 'admin')
    AND (contact_id IS NULL OR EXISTS (
      SELECT 1 FROM contacts c WHERE c.id = contact_id AND c.account_id = finance_receivables.account_id))
    AND (contract_id IS NULL OR EXISTS (
      SELECT 1 FROM client_contracts k WHERE k.id = contract_id AND k.account_id = finance_receivables.account_id))
    AND (entry_id IS NULL OR EXISTS (
      SELECT 1 FROM finance_entries e WHERE e.id = entry_id AND e.account_id = finance_receivables.account_id))
  );

-- ------------------------------------------------------------
-- Cobranças do mês a partir dos contratos recorrentes assinados.
-- SECURITY INVOKER: roda sob a RLS de quem chama. Idempotente.
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

  INSERT INTO finance_receivables (
    account_id, contract_id, contact_id, description, amount_cents,
    reference_month, due_date, created_by
  )
  SELECT
    k.account_id, k.id, k.contact_id,
    left('Mensalidade — ' || k.title, 120),
    ROUND(k.monthly_price * 100)::bigint,
    v_month,
    v_month + (LEAST(COALESCE(k.billing_day, 1), v_last_day) - 1),
    auth.uid()
  FROM client_contracts k
  WHERE k.account_id = p_account_id
    AND k.type = 'recorrente'
    AND k.status = 'assinado'
    AND k.monthly_price > 0
    AND (k.signed_at IS NULL OR date_trunc('month', k.signed_at)::date <= v_month)
  ON CONFLICT (contract_id, reference_month) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_contract_receivables(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_contract_receivables(UUID, DATE) TO authenticated, service_role;
