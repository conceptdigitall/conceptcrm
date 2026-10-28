-- Migration 058: publicação do Instagram em segundo plano.
-- 'publishing' marca o post enquanto a Meta processa a mídia (um Reel leva ~1-3 min);
-- publish_started_at deixa a rota soltar um post que ficou preso se a função caiu no meio.
ALTER TABLE marketing_posts DROP CONSTRAINT IF EXISTS marketing_posts_status_check;
ALTER TABLE marketing_posts
  ADD CONSTRAINT marketing_posts_status_check
  CHECK (status IN ('draft','pending_approval','scheduled','publishing','published','archived'));

ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS publish_started_at TIMESTAMPTZ;
