'use client';

import React, { useState, useMemo } from 'react';
import {
  Radar,
  Search,
  MessageSquare,
  Clock,
  Upload,
  Calendar,
  Sparkles,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NicheKey, getNicheConfig } from '@/config/niches';
import {
  ReactivationResult,
  ReactivationUrgency,
} from '@/lib/prospecting/reactivation';

export interface ReactivationRadarProps {
  candidates: ReactivationResult[];
  niche: NicheKey;
  onSelectCandidate: (candidate: ReactivationResult) => void;
  onOpenCsvImporter?: () => void;
  isLoading?: boolean;
}

const URGENCY_BADGE_STYLES: Record<ReactivationUrgency, { bg: string; text: string; border: string }> = {
  no_ciclo: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  atrasado: {
    bg: 'bg-amber-500/10 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
  critico: {
    bg: 'bg-rose-500/10 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-500/30',
  },
};

export function ReactivationRadar({
  candidates,
  niche,
  onSelectCandidate,
  onOpenCsvImporter,
  isLoading = false,
}: ReactivationRadarProps) {
  const nicheConfig = useMemo(() => getNicheConfig(niche), [niche]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterUrgency, setFilterUrgency] = useState<string>('all');

  const filteredCandidates = useMemo(() => {
    return candidates.filter((item) => {
      const matchSearch =
        item.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.contact.phone.includes(searchQuery);

      const matchUrgency =
        filterUrgency === 'all' || item.urgency === filterUrgency;

      return matchSearch && matchUrgency;
    });
  }, [candidates, searchQuery, filterUrgency]);

  const countsByUrgency = useMemo(() => {
    const counts = { all: candidates.length, no_ciclo: 0, atrasado: 0, critico: 0 };
    for (const c of candidates) {
      counts[c.urgency] = (counts[c.urgency] || 0) + 1;
    }
    return counts;
  }, [candidates]);

  return (
    <div className="space-y-4">
      {/* Cabeçalho do Radar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-border/80 bg-card shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#0624C7]/10 text-[#0624C7] dark:bg-blue-400/10 dark:text-blue-400">
            <Radar className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">
                Radar de Reativação da Base
              </h3>
              <Badge variant="outline" className="text-[11px] font-semibold">
                Ciclo: {nicheConfig.defaultReactivationDays} dias
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identificação inteligente de clientes no momento oportuno de retorno para {nicheConfig.label}.
            </p>
          </div>
        </div>

        {onOpenCsvImporter && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenCsvImporter}
            className="h-9 text-xs gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Upload className="size-3.5" />
            <span>Importar CSV</span>
          </Button>
        )}
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome ou WhatsApp..."
            className="pl-8.5 h-9 text-xs bg-background"
          />
        </div>

        {/* Chips de Temperatura */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
          <button
            type="button"
            onClick={() => setFilterUrgency('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterUrgency === 'all'
                ? 'bg-foreground text-background shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            Todos ({countsByUrgency.all})
          </button>

          <button
            type="button"
            onClick={() => setFilterUrgency('no_ciclo')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterUrgency === 'no_ciclo'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            No momento ({countsByUrgency.no_ciclo})
          </button>

          <button
            type="button"
            onClick={() => setFilterUrgency('atrasado')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterUrgency === 'atrasado'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            Atrasados ({countsByUrgency.atrasado})
          </button>

          <button
            type="button"
            onClick={() => setFilterUrgency('critico')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterUrgency === 'critico'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20'
            }`}
          >
            Críticos ({countsByUrgency.critico})
          </button>
        </div>
      </div>

      {/* Lista / Cards de Clientes no Radar */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-muted-foreground">
          Carregando clientes no radar...
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="p-12 rounded-2xl border border-dashed border-border/80 text-center space-y-2 bg-muted/10">
          <Sparkles className="size-8 text-muted-foreground mx-auto" />
          <h4 className="text-sm font-semibold text-foreground">
            Nenhum cliente necessitando reativação no momento
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Todos os seus contatos foram atendidos recentemente ou possuem agendamentos futuros programados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCandidates.map((item) => {
            const badgeStyle = URGENCY_BADGE_STYLES[item.urgency];
            const dateStr = new Date(item.lastActivityDate).toLocaleDateString('pt-BR');

            return (
              <div
                key={item.contact.id}
                className="flex flex-col justify-between p-4 rounded-2xl border border-border/80 bg-card hover:border-[#0624C7]/40 dark:hover:border-blue-400/40 transition-all shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-bold text-foreground line-clamp-1">
                      {item.contact.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold border ${badgeStyle.border} ${badgeStyle.bg} ${badgeStyle.text}`}
                    >
                      {item.urgencyLabel}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-mono">
                      <Phone className="size-3 text-muted-foreground/70" />
                      <span>{item.contact.phone}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3 text-muted-foreground/70" />
                      <span>
                        <strong className="text-foreground">{item.daysInactive} dias</strong> sem retorno
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                      <Calendar className="size-3 text-muted-foreground/70" />
                      <span>Último atendimento: {dateStr}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-2 border-t border-border/40">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onSelectCandidate(item)}
                    className="w-full h-8.5 text-xs gap-1.5 bg-[#0624C7] hover:bg-[#051db0] text-white cursor-pointer shadow-xs"
                  >
                    <MessageSquare className="size-3.5" />
                    <span>Abordar com Playbook</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
