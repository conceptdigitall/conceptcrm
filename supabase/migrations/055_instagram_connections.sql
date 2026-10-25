-- ============================================================
-- 055 — Instagram por conta
--
-- Cada conta conecta o próprio Instagram (ID da conta profissional +
-- token da Meta). Antes a publicação usava META_ACCESS_TOKEN do
-- ambiente, que é o Instagram da Concept: com revenda, todo cliente
-- publicaria no mesmo perfil.
--
-- O token fica cifrado (AES-256-GCM, mesma ENCRYPTION_KEY dos tokens do
-- WhatsApp) e a tabela não tem policy nenhuma: o navegador (anon e
-- authenticated) não lê nem escreve. Só as rotas do servidor, com
-- service role, depois de conferir conta e papel.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS instagram_connections (
  account_id     uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  ig_user_id     text NOT NULL CHECK (ig_user_id ~ '^[0-9]{5,30}$'),
  username       text,
  access_token   text NOT NULL,          -- cifrado; nunca volta para o cliente
  connected_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE instagram_connections ENABLE ROW LEVEL SECURITY;

-- Sem policies de propósito, e sem privilégio de tabela para os papéis
-- do PostgREST: mesmo um erro futuro de policy não expõe o token.
REVOKE ALL ON TABLE instagram_connections FROM anon, authenticated;
