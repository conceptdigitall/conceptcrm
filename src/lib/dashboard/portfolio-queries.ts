import type { SupabaseClient } from '@supabase/supabase-js'

export interface ModelRankingItem {
  title: string
  clicks: number
  percentage: number
}

export interface PortfolioMetricsBundle {
  totalViews: number
  viewsToday: number
  viewsYesterday: number
  totalProjectClicks: number
  topModel: {
    title: string
    clicks: number
  } | null
  modelsRanking: ModelRankingItem[]
  totalLeads: number
  isReady: boolean
}

type DB = SupabaseClient

/**
 * Carrega as métricas de telemetria do portfólio diretamente do Supabase.
 * Trata erros graciosamente caso as tabelas ainda estejam sem dados.
 */
export async function loadPortfolioMetrics(db: DB): Promise<PortfolioMetricsBundle> {
  const emptyBundle: PortfolioMetricsBundle = {
    totalViews: 0,
    viewsToday: 0,
    viewsYesterday: 0,
    totalProjectClicks: 0,
    topModel: null,
    modelsRanking: [],
    totalLeads: 0,
    isReady: false,
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.toISOString()

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStart = yesterday.toISOString()

    // 1. Consultas em paralelo com tratamento individual de erros
    const [
      viewsTotalRes,
      viewsTodayRes,
      viewsYesterdayRes,
      projectClicksRes,
      ctaClicksRes,
    ] = await Promise.all([
      db.from('page_views').select('id', { count: 'exact', head: true }),
      db.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      db
        .from('page_views')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterdayStart)
        .lt('created_at', todayStart),
      db.from('project_clicks').select('project_title'),
      db.from('cta_clicks').select('id', { count: 'exact', head: true }),
    ])

    // Se houve erro de tabela inexistente (ex: 42P01), retorna gracioso
    if (viewsTotalRes.error && viewsTotalRes.error.code === '42P01') {
      return emptyBundle
    }

    const totalViews = viewsTotalRes.count ?? 0
    const viewsToday = viewsTodayRes.count ?? 0
    const viewsYesterday = viewsYesterdayRes.count ?? 0
    const totalLeads = ctaClicksRes.count ?? 0

    // 2. Agregação dos cliques em modelos
    const clicksData = projectClicksRes.data || []
    const totalProjectClicks = clicksData.length

    const countsMap: Record<string, number> = {}
    for (const item of clicksData) {
      const name = item.project_title?.trim() || 'Outro Modelo'
      countsMap[name] = (countsMap[name] || 0) + 1
    }

    const sortedModels = Object.entries(countsMap)
      .map(([title, clicks]) => ({
        title,
        clicks,
        percentage: totalProjectClicks > 0 ? Math.round((clicks / totalProjectClicks) * 100) : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    const topModel = sortedModels.length > 0 ? sortedModels[0] : null
    const modelsRanking = sortedModels.slice(0, 5)

    return {
      totalViews,
      viewsToday,
      viewsYesterday,
      totalProjectClicks,
      topModel,
      modelsRanking,
      totalLeads,
      isReady: true,
    }
  } catch (error) {
    console.warn('[PortfolioMetrics] Falha silenciosa ao carregar métricas:', error)
    return emptyBundle
  }
}
