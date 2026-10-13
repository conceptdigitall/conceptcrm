'use client';

import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type MarketingSubtab = 'feed' | 'stories' | 'projects' | 'library' | 'settings';

interface MarketingTabsHeaderProps {
  currentTab: MarketingSubtab;
  onTabChange: (tab: MarketingSubtab) => void;
  pendingCount: number;
  instagramUsername?: string;
  onFilterPending?: () => void;
}

const TABS: { id: MarketingSubtab; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'stories', label: 'Stories' },
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
}: MarketingTabsHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground font-heading">
              Marketing
            </h1>
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary-soft text-xs gap-1">
              <Sparkles className="w-3 h-3" />
              IA Ativa
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Posts e stories com IA para @{instagramUsername}
          </p>
        </div>

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={onFilterPending}
            className="inline-flex items-center gap-2 min-h-11 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {pendingCount} esperando sua aprovação
          </button>
        )}
      </header>

      <nav
        className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-muted p-1 md:inline-flex md:self-start"
        aria-label="Subabas de marketing"
      >
        {TABS.map((t) => {
          const isActive = currentTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                haptic();
                onTabChange(t.id);
              }}
              className={`flex items-center justify-center h-11 px-1 md:px-5 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap active:scale-95 ${
                isActive
                  ? 'bg-card text-foreground font-semibold shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
