-- ============================================================
-- 059_store_module.sql — Módulo Loja: pedidos, envios, pós-venda e analytics
-- Spec: docs/superpowers/specs/2026-11-06-modulo-loja-essence-wear-design.md
--
-- Tudo é separado por account_id (várias lojas dividem este projeto Supabase).
-- Gravações vindas de fora (checkout, webhooks, track) passam pelo servidor do
-- CRM com a service role, presas à conta do deploy (CRM_ACCOUNT_ID).
-- ============================================================

-- ---------- Configurações da loja (visíveis aos membros) ----------
CREATE TABLE IF NOT EXISTS store_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  order_prefix TEXT NOT NULL DEFAULT 'EW',
  site_url TEXT,
  sender_address JSONB,
  box JSONB,
  currency TEXT NOT NULL DEFAULT 'usd',
  email_from TEXT,
  review_url TEXT,
  next_order_number INTEGER NOT NULL DEFAULT 1001,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Chaves (só service role; cifradas com ENCRYPTION_KEY) ----------
-- Separadas de store_settings porque o RLS não esconde colunas: qualquer membro
-- leria o texto cifrado. Aqui não há política para authenticated.
CREATE TABLE IF NOT EXISTS store_secrets (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  stripe_secret_key_enc TEXT,
  stripe_webhook_secret_enc TEXT,
  shippo_api_key_enc TEXT,
  shippo_webhook_token_enc TEXT,
  resend_api_key_enc TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Produtos ----------
CREATE TABLE IF NOT EXISTS store_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  colors TEXT[] NOT NULL DEFAULT '{}',
  sizes TEXT[] NOT NULL DEFAULT '{}',
  weight_oz NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (weight_oz >= 0),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, slug)
);

-- ---------- Pedidos ----------
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN
    ('paid', 'preparing', 'label_ready', 'shipped', 'delivered', 'canceled', 'refunded')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  customer_name TEXT,
  shipping_address JSONB,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  payment_provider TEXT NOT NULL DEFAULT 'stripe',
  payment_ref TEXT NOT NULL,
  payment_intent TEXT,
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, number),
  UNIQUE (payment_provider, payment_ref)
);
CREATE INDEX IF NOT EXISTS idx_orders_account_status ON orders (account_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders (contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent ON orders (payment_intent);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES store_products(id) ON DELETE SET NULL,
  product_slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  color TEXT,
  size TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  carrier TEXT,
  service TEXT,
  cost_cents INTEGER,
  tracking_number TEXT,
  tracking_url TEXT,
  label_url TEXT,
  eta TIMESTAMPTZ,
  tracking_status TEXT,
  shippo_transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments (tracking_number);

CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events (order_id, created_at);

-- ---------- Avisos de webhook já processados (só service role) ----------
CREATE TABLE IF NOT EXISTS processed_webhooks (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);

-- ---------- Eventos do site (analytics) ----------
CREATE TABLE IF NOT EXISTS store_events (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT,
  product_slug TEXT,
  value TEXT,
  referrer_source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device TEXT,
  country TEXT,
  region TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_events_account_time ON store_events (account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_store_events_account_type_product
  ON store_events (account_id, type, product_slug);

-- ---------- Número do pedido (sequência por conta) ----------
CREATE OR REPLACE FUNCTION public.store_next_order_number(p_account UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE store_settings
     SET next_order_number = next_order_number + 1
   WHERE account_id = p_account
  RETURNING next_order_number - 1;
$$;
REVOKE ALL ON FUNCTION public.store_next_order_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_next_order_number(UUID) TO service_role;

-- ---------- Retenção de 13 meses ----------
CREATE OR REPLACE FUNCTION public.store_purge_old_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM store_events WHERE created_at < NOW() - INTERVAL '13 months';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.store_purge_old_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_purge_old_events() TO service_role;

-- ---------- RLS ----------
ALTER TABLE store_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_secrets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_events       ENABLE ROW LEVEL SECURITY;

-- Configurações e produtos: membros leem, admin grava.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['store_settings', 'store_products'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON %1$s FOR SELECT USING (is_account_member(account_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_write ON %1$s FOR ALL USING (is_account_member(account_id, ''admin'')) WITH CHECK (is_account_member(account_id, ''admin''))', t);
  END LOOP;

  -- Pedidos e derivados: membros leem, agentes alteram.
  FOREACH t IN ARRAY ARRAY['orders', 'order_items', 'shipments', 'order_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON %1$s FOR SELECT USING (is_account_member(account_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_write ON %1$s FOR ALL USING (is_account_member(account_id, ''agent'')) WITH CHECK (is_account_member(account_id, ''agent''))', t);
  END LOOP;

  -- Eventos do site: membros só leem; só a service role grava.
  DROP POLICY IF EXISTS store_events_select ON store_events;
  CREATE POLICY store_events_select ON store_events FOR SELECT USING (is_account_member(account_id));
END $$;
-- store_secrets e processed_webhooks: sem políticas (só service role).
