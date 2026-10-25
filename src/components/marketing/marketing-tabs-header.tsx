'use client';

import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type MarketingSubtab = 'feed' | 'stories' | 'videos' | 'ads' | 'projects' | 'library' | 'settings';

interface MarketingTabsHeaderProps {
  currentTab: MarketingSubtab;
  onTabChange: (tab: MarketingSubtab) => void;
  pendingCount: number;
  instagramUsername?: string;
  onFilterPending?: () => void;
  /** Aba destacada pelo tour de primeiro uso. */
  highlightTab?: MarketingSubtab | null;
}

const TABS: { id: MarketingSubtab; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'stories', label: 'Stories' },
  { id: 'videos', label: 'Vídeos' },
  { id: 'ads', label: 'Tráfego IA' },
  { id: 'projects', label: 'Projetos' },
  { id: 'library', label: 'Biblioteca' },
  { id: 'settings', label: 'Ajustes' },
];

// Toque sutil no Android ao trocar de aba; no iOS a API não existe e nada acontece.
function haptic() {
  if (typeof navigator !== 'undefined') navigator.vibrate?.(10);
}

export function MarketingTabsHeader({
  currentTab,
  onTabChange,
  pendingCount,
  instagramUsername = 'conceptdigita.l',
  onFilterPending,
  highlightTab,
}: MarketingTabsHeaderProps) {
  const navRef = useRef<HTMLElement>(null);

  // No celular as abas rolam de lado: traz para a vista a aba ativa ou a destacada pelo tour.
  const focusTab = highlightTab ?? currentTab;
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-tab="${focusTab}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [focusTab]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-foreground font-heading">
              Concept Autopilot
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex border-primary/30 text-primary bg-primary-soft text-xs gap-1">
              <Sparkles className="w-3 h-3" />
              Conteúdo + Tráfego IA
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Posts, vídeos e Squad de Tráfego Pago com IA para @{instagramUsername}
          </p>
        </div>

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={onFilterPending}
            className="inline-flex items-center gap-2 min-h-11 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {pendingCount} esperando sua aprovação
          </button>
        )}
      </header>

      {/* No celular rola de lado (7 abas não cabem em 2 linhas legíveis). */}
      <nav
        ref={navRef}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:self-start md:overflow-visible md:rounded-2xl md:border md:border-border md:bg-muted md:p-1"
        aria-label="Subabas de marketing"
      >
        {TABS.map((t) => {
          const isActive = currentTab === t.id;
          const isHighlighted = highlightTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-tab={t.id}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                haptic();
                onTabChange(t.id);
              }}
              className={`flex shrink-0 items-center justify-center h-10 px-4 md:px-5 rounded-xl text-sm font-medium transition-all whitespace-nowrap active:scale-95 ${
                isActive
                  ? 'bg-card text-foreground font-semibold shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground md:bg-transparent'
              } ${isHighlighted ? 'ring-2 ring-[#FCE026]' : isActive ? 'ring-1 ring-border' : ''}`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
