-- Migration 052: Marketing posts, settings, projects e integração com Instagram
CREATE TABLE IF NOT EXISTS marketing_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('feed','story')),
  media_type TEXT NOT NULL DEFAULT 'foto' CHECK (media_type IN ('foto','carrossel','video')),
  title TEXT NOT NULL DEFAULT '',
  idea TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  video_id UUID REFERENCES marketing_videos(id) ON DELETE SET NULL,
  frames JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','scheduled','published','archived')),
  scheduled_at TIMESTAMPTZ,
  parent_id UUID REFERENCES marketing_posts(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  instagram_media_id TEXT,
  instagram_permalink TEXT,
  posted_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_posts_account ON marketing_posts(account_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_posts_parent ON marketing_posts(parent_id);

CREATE TABLE IF NOT EXISTS marketing_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  caption_style TEXT NOT NULL DEFAULT 'direto' CHECK (caption_style IN ('direto','educativo','provocativo','storytelling')),
  caption_size TEXT NOT NULL DEFAULT 'media' CHECK (caption_size IN ('curta','media','longa')),
  emoji_level TEXT NOT NULL DEFAULT 'poucos' CHECK (emoji_level IN ('nenhum','poucos','muitos')),
  cta TEXT NOT NULL DEFAULT '',
  never_use TEXT NOT NULL DEFAULT '',
  hashtags JSONB NOT NULL DEFAULT '[]',
  require_approval BOOLEAN NOT NULL DEFAULT TRUE,
  instagram_user_id TEXT,
  instagram_username TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'landing' CHECK (category IN ('landing','recepcionista','marketing')),
  url TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','building','demo','soon')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_projects_account ON marketing_projects(account_id);

ALTER TABLE marketing_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_projects ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_posts','marketing_settings','marketing_projects'] LOOP
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
