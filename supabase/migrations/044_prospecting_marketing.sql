-- ============================================================
-- 044_prospecting_marketing.sql — Prospecção (Google Maps leads)
-- and Marketing (AI video) job queues. Internal Concept tooling.
-- Additive and idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  location TEXT NOT NULL,
  max_results INTEGER NOT NULL DEFAULT 50 CHECK (max_results BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  error TEXT,
  result_count INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_searches_account ON lead_searches(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_searches_status ON lead_searches(status, created_at);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  search_id UUID REFERENCES lead_searches(id) ON DELETE SET NULL,
  place_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  address TEXT,
  phone TEXT,
  is_mobile BOOLEAN NOT NULL DEFAULT FALSE,
  website TEXT,
  email TEXT,
  rating NUMERIC(2,1),
  review_count INTEGER,
  maps_url TEXT,
  raw JSONB,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  score_reasons TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','contatado','qualificado','descartado')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL place_ids never collide (Postgres treats NULLs as distinct).
  CONSTRAINT leads_account_place_unique UNIQUE (account_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_leads_account_score ON leads(account_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_search ON leads(search_id);

CREATE TABLE IF NOT EXISTS marketing_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  image_paths TEXT[] NOT NULL DEFAULT '{}',
  format TEXT NOT NULL DEFAULT 'vertical' CHECK (format IN ('vertical','square','landscape')),
  tone TEXT NOT NULL DEFAULT 'default' CHECK (tone IN ('default','polished','app-store','cinematic')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  error TEXT,
  video_path TEXT,
  poster_path TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_videos_account ON marketing_videos(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_videos_status ON marketing_videos(status, created_at);

ALTER TABLE lead_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_videos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_searches','leads','marketing_videos'] LOOP
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

-- Private bucket: uploaded photos and rendered videos. The worker
-- writes with the service role; members read via signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('marketing', 'marketing', FALSE, 104857600,
        ARRAY['image/jpeg','image/png','image/webp','video/mp4'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Members can read marketing media" ON storage.objects;
CREATE POLICY "Members can read marketing media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can upload marketing media" ON storage.objects;
CREATE POLICY "Members can upload marketing media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete marketing media" ON storage.objects;
CREATE POLICY "Members can delete marketing media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
