-- ============================================================
-- 063_secure_portfolio_analytics.sql — Revoke Anonymous Update on Analytics
-- ============================================================
-- Impede que usuários com a chave anonima (pública no frontend) executem
-- updates arbitrários em registros de page_views.

DROP POLICY IF EXISTS "Permitir atualizacao anonima page_views" ON public.page_views;

-- Função segura com SECURITY DEFINER para atualização controlada de métricas
CREATE OR REPLACE FUNCTION public.track_page_view_update(
    p_id UUID,
    p_time_spent INTEGER,
    p_max_scroll INTEGER
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.page_views
       SET time_spent = GREATEST(time_spent, LEAST(GREATEST(p_time_spent, 0), 86400)),
           max_scroll = GREATEST(max_scroll, LEAST(GREATEST(p_max_scroll, 0), 100))
     WHERE id = p_id
       AND created_at > NOW() - INTERVAL '1 day';
$$;

REVOKE ALL ON FUNCTION public.track_page_view_update(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_page_view_update(UUID, INTEGER, INTEGER) TO anon, authenticated;
