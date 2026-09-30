'use client'

import React from 'react'
import { Globe, Flame, MousePointerClick, MessageSquareCode, ArrowUp, ArrowDown, Minus, Layers } from 'lucide-react'
import type { PortfolioMetricsBundle } from '@/lib/dashboard/portfolio-queries'
import { cn } from '@/lib/utils'

interface PortfolioAnalyticsProps {
  data: PortfolioMetricsBundle | null
  loading: boolean
}

export function PortfolioAnalytics({ data, loading }: PortfolioAnalyticsProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card p-5 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const viewsDiff = (data?.viewsToday ?? 0) - (data?.viewsYesterday ?? 0)
  const totalViews = data?.totalViews ?? 0
  const totalClicks = data?.totalProjectClicks ?? 0
  const topModelTitle = data?.topModel?.title ?? 'Nenhum ainda'
  const topModelClicks = data?.topModel?.clicks ?? 0
  const totalLeads = data?.totalLeads ?? 0
  const ranking = data?.modelsRanking ?? []

  return (
    <div className="space-y-5 rounded-2xl border border-border/80 bg-card/50 p-6 backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Métricas do Portfólio & Modelos Concept
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tráfego em tempo real e interesse nos sites modelos da agência
          </p>
        </div>
      </div>

      {/* 4 Cards de Métricas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Visitas Totais */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Visitas Portfólio</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-[26px] font-bold tabular-nums text-foreground">
            {totalViews.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {viewsDiff > 0 ? (
              <span className="flex items-center text-emerald-500 font-medium">
                <ArrowUp className="h-3.5 w-3.5 mr-0.5" /> +{viewsDiff} hoje
              </span>
            ) : viewsDiff < 0 ? (
              <span className="flex items-center text-amber-500 font-medium">
                <ArrowDown className="h-3.5 w-3.5 mr-0.5" /> {viewsDiff} hoje
              </span>
            ) : (
              <span className="flex items-center text-muted-foreground">
                <Minus className="h-3.5 w-3.5 mr-0.5" /> Estável vs ontem
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Modelo Campeão */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Modelo Mais Acessado</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Flame className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-lg font-bold text-foreground truncate" title={topModelTitle}>
            {topModelTitle}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {topModelClicks > 0 ? (
              <span className="font-semibold text-foreground">{topModelClicks} cliques de interesse</span>
            ) : (
              'Aguardando primeiros cliques'
            )}
          </p>
        </div>

        {/* Card 3: Demonstrações Vistas */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliques em Modelos</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <MousePointerClick className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-[26px] font-bold tabular-nums text-foreground">
            {totalClicks.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Aberturas de demonstração
          </p>
        </div>

        {/* Card 4: Cliques em CTA / Contato */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CTAs do Portfólio</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <MessageSquareCode className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-[26px] font-bold tabular-nums text-foreground">
            {totalLeads.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Contatos e WhatsApp iniciados
          </p>
        </div>
      </div>

      {/* Ranking dos Modelos Mais Acessados */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Ranking de Modelos Mais Buscados
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">Top 5 por volume</span>
        </div>

        {ranking.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Nenhum clique em modelos registrado ainda. As métricas aparecerão assim que os clientes navegarem pelo portfólio.
          </div>
        ) : (
          <div className="space-y-3.5">
            {ranking.map((item, index) => (
              <div key={item.title} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                      index === 0 ? "bg-amber-500/20 text-amber-500" :
                      index === 1 ? "bg-slate-300/20 text-slate-300" :
                      index === 2 ? "bg-amber-700/20 text-amber-600" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {index + 1}
                    </span>
                    <span className="font-medium text-foreground">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{item.clicks} cliques</span>
                    <span className="font-semibold text-foreground min-w-[36px] text-right">{item.percentage}%</span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      index === 0 ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ width: `${Math.max(item.percentage, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
