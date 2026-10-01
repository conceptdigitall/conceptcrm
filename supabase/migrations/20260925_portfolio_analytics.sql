-- Migração: Métricas e Telemetria do Portfólio Concept
-- Tabelas para rastrear visitas, cliques nos modelos de sites e conversões

CREATE TABLE IF NOT EXISTS public.page_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    path TEXT NOT NULL,
    device TEXT,
    time_spent INTEGER DEFAULT 0,
    max_scroll INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id INTEGER NOT NULL,
    project_title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.form_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'start' ou 'submit'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cta_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    button_id TEXT NOT NULL, -- 'whatsapp_contact', 'email_contact', 'header_contact' etc
    path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para relatórios rápidos e agregação no dashboard
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_clicks_created_at ON public.project_clicks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_clicks_title ON public.project_clicks (project_title);
CREATE INDEX IF NOT EXISTS idx_cta_clicks_created_at ON public.cta_clicks (created_at DESC);

-- Permissões de RLS para o Portfólio (anon pode inserir para coletar métricas)
-- e authenticated/service_role pode consultar e gerenciar
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_clicks ENABLE ROW LEVEL SECURITY;

-- Políticas de Inserção Pública (o portfólio grava anonimamente)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Permitir insercao anonima page_views" ON public.page_views;
    CREATE POLICY "Permitir insercao anonima page_views" ON public.page_views FOR INSERT TO anon, authenticated WITH CHECK (true);

    DROP POLICY IF EXISTS "Permitir atualizacao anonima page_views" ON public.page_views;
    CREATE POLICY "Permitir atualizacao anonima page_views" ON public.page_views FOR UPDATE TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS "Permitir insercao anonima project_clicks" ON public.project_clicks;
    CREATE POLICY "Permitir insercao anonima project_clicks" ON public.project_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);

    DROP POLICY IF EXISTS "Permitir insercao anonima form_events" ON public.form_events;
    CREATE POLICY "Permitir insercao anonima form_events" ON public.form_events FOR INSERT TO anon, authenticated WITH CHECK (true);

    DROP POLICY IF EXISTS "Permitir insercao anonima cta_clicks" ON public.cta_clicks;
    CREATE POLICY "Permitir insercao anonima cta_clicks" ON public.cta_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);

    -- Políticas de Leitura para o CRM (authenticated)
    DROP POLICY IF EXISTS "Permitir leitura autenticada page_views" ON public.page_views;
    CREATE POLICY "Permitir leitura autenticada page_views" ON public.page_views FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Permitir leitura autenticada project_clicks" ON public.project_clicks;
    CREATE POLICY "Permitir leitura autenticada project_clicks" ON public.project_clicks FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Permitir leitura autenticada form_events" ON public.form_events;
    CREATE POLICY "Permitir leitura autenticada form_events" ON public.form_events FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Permitir leitura autenticada cta_clicks" ON public.cta_clicks;
    CREATE POLICY "Permitir leitura autenticada cta_clicks" ON public.cta_clicks FOR SELECT TO authenticated USING (true);
END $$;
