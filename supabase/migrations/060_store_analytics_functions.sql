-- ============================================================
-- 060_store_analytics_functions.sql — agregações do dashboard da Loja
-- security invoker: o RLS de store_events/orders filtra pela conta do usuário.
-- ============================================================

CREATE OR REPLACE FUNCTION public.store_analytics(p_account UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH ev AS (
  SELECT * FROM store_events
   WHERE account_id = p_account AND created_at >= p_from AND created_at < p_to
),
paid AS (
  SELECT * FROM orders
   WHERE account_id = p_account AND paid_at >= p_from AND paid_at < p_to
     AND status NOT IN ('refunded', 'canceled')
),
sold AS (
  SELECT oi.product_slug, oi.color, oi.size, oi.quantity
    FROM order_items oi JOIN paid o ON o.id = oi.order_id
),
sessions AS (
  SELECT session_id,
         SUM(COALESCE(duration_ms, 0)) FILTER (WHERE type IN ('heartbeat', 'leave')) AS ms
    FROM ev GROUP BY session_id
),
session_flags AS (
  SELECT session_id,
         bool_or(type = 'page_view') AS viewed,
         bool_or(type = 'product_view') AS product,
         bool_or(type = 'add_to_cart') AS cart,
         bool_or(type = 'checkout_start') AS checkout
    FROM ev GROUP BY session_id
),
products AS (
  SELECT slug,
         SUM(views)::int AS views, SUM(spins)::int AS spins, SUM(adds)::int AS adds, SUM(sold_qty)::int AS sold_qty
    FROM (
      SELECT product_slug AS slug,
             COUNT(*) FILTER (WHERE type = 'product_view') AS views,
             COUNT(*) FILTER (WHERE type = 'product_spin') AS spins,
             COUNT(*) FILTER (WHERE type = 'add_to_cart') AS adds,
             0 AS sold_qty
        FROM ev WHERE product_slug IS NOT NULL GROUP BY product_slug
      UNION ALL
      SELECT product_slug, 0, 0, 0, SUM(quantity) FROM sold GROUP BY product_slug
    ) x
   GROUP BY slug
)
SELECT jsonb_build_object(
  'visits', (SELECT COUNT(DISTINCT session_id) FROM ev),
  'unique_visitors', (SELECT COUNT(DISTINCT visitor_id) FROM ev),
  'avg_session_seconds', COALESCE((SELECT ROUND(AVG(ms) / 1000.0) FROM sessions WHERE ms > 0), 0),
  'orders', (SELECT COUNT(*) FROM paid),
  'revenue_cents', COALESCE((SELECT SUM(total_cents) FROM paid), 0),
  'funnel', jsonb_build_object(
    'visited', (SELECT COUNT(*) FROM session_flags WHERE viewed),
    'product_view', (SELECT COUNT(*) FROM session_flags WHERE product),
    'add_to_cart', (SELECT COUNT(*) FROM session_flags WHERE cart),
    'checkout_start', (SELECT COUNT(*) FROM session_flags WHERE checkout),
    'paid', (SELECT COUNT(*) FROM paid)
  ),
  'products', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.views DESC) FROM products p), '[]'::jsonb),
  'colors', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('value', value, 'picks', picks, 'sold', sold) ORDER BY picks DESC)
      FROM (
        SELECT value, SUM(picks)::int AS picks, SUM(sold)::int AS sold FROM (
          SELECT value, COUNT(*) AS picks, 0 AS sold FROM ev WHERE type = 'color_select' AND value IS NOT NULL GROUP BY value
          UNION ALL SELECT color, 0, SUM(quantity) FROM sold WHERE color IS NOT NULL GROUP BY color
        ) c GROUP BY value
      ) c2), '[]'::jsonb),
  'sizes', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('value', value, 'picks', picks, 'sold', sold) ORDER BY picks DESC)
      FROM (
        SELECT value, SUM(picks)::int AS picks, SUM(sold)::int AS sold FROM (
          SELECT value, COUNT(*) AS picks, 0 AS sold FROM ev WHERE type = 'size_select' AND value IS NOT NULL GROUP BY value
          UNION ALL SELECT size, 0, SUM(quantity) FROM sold WHERE size IS NOT NULL GROUP BY size
        ) s GROUP BY value
      ) s2), '[]'::jsonb),
  'sources', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('value', v, 'count', n) ORDER BY n DESC)
      FROM (SELECT COALESCE(utm_source, referrer_source, 'direct') AS v, COUNT(*)::int AS n
              FROM ev WHERE type = 'page_view' GROUP BY 1) x), '[]'::jsonb),
  'devices', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('value', device, 'count', n) ORDER BY n DESC)
      FROM (SELECT device, COUNT(DISTINCT session_id)::int AS n FROM ev WHERE device IS NOT NULL GROUP BY device) x), '[]'::jsonb),
  'regions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('value', region, 'count', n) ORDER BY n DESC)
      FROM (SELECT region, COUNT(DISTINCT session_id)::int AS n FROM ev
             WHERE region IS NOT NULL GROUP BY region ORDER BY n DESC LIMIT 10) x), '[]'::jsonb),
  'daily', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('day', d, 'visits', n) ORDER BY d)
      FROM (SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, COUNT(DISTINCT session_id)::int AS n
              FROM ev GROUP BY 1) x), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.store_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
