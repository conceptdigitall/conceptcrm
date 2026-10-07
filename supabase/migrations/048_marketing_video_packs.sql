-- Marketing por pacote de nicho (sub-projeto 1): vídeos gerados por template
-- fixo + diretor. Só aditiva: colunas novas, backfill e uma constraint.
--   reels  = vídeo para Instagram/TikTok (9:16 ou 1:1)
--   resumo = vídeo para o site do cliente (16:9), nunca postado nas redes

ALTER TABLE marketing_videos
  ADD COLUMN IF NOT EXISTS kind TEXT,
  ADD COLUMN IF NOT EXISTS niche TEXT,
  ADD COLUMN IF NOT EXISTS template_id TEXT,
  ADD COLUMN IF NOT EXISTS director_input JSONB,
  ADD COLUMN IF NOT EXISTS director_output JSONB,
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS error_kind TEXT;

-- Vídeos antigos: horizontal vira Resumo, o resto vira Reels.
UPDATE marketing_videos
   SET kind = CASE WHEN format = 'landscape' THEN 'resumo' ELSE 'reels' END
 WHERE kind IS NULL;

ALTER TABLE marketing_videos ALTER COLUMN kind SET NOT NULL;

ALTER TABLE marketing_videos DROP CONSTRAINT IF EXISTS marketing_videos_kind_check;
ALTER TABLE marketing_videos
  ADD CONSTRAINT marketing_videos_kind_check CHECK (kind IN ('reels', 'resumo'));

ALTER TABLE marketing_videos DROP CONSTRAINT IF EXISTS marketing_videos_error_kind_check;
ALTER TABLE marketing_videos
  ADD CONSTRAINT marketing_videos_error_kind_check
  CHECK (error_kind IS NULL OR error_kind IN ('photos', 'director', 'render'));

ALTER TABLE marketing_videos DROP CONSTRAINT IF EXISTS marketing_videos_kind_format;
ALTER TABLE marketing_videos
  ADD CONSTRAINT marketing_videos_kind_format CHECK (
    (kind = 'resumo' AND format = 'landscape')
    OR (kind = 'reels' AND format IN ('vertical', 'square'))
  );
