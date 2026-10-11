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

export function MarketingTabsHeader({
  currentTab,
  onTabChange,
  pendingCount,
  instagramUsername = 'conceptdigita.l',
  onFilterPending,
}: MarketingTabsHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-[#14245C] pb-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-heading">
              Marketing
            </h1>
            <Badge variant="outline" className="border-[#FCE026]/40 text-[#FCE026] bg-[#FCE026]/10 text-xs gap-1">
              <Sparkles className="w-3 h-3" />
              IA Ativa
            </Badge>
          </div>
          <p className="text-sm text-[#9FB0E6]">
            @{instagramUsername} · 5 dias seguidos postando
          </p>
        </div>

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={onFilterPending}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/40 px-3.5 py-1.5 text-xs font-semibold text-[#FCE026] hover:bg-amber-900/50 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-[#FCE026] animate-pulse" />
            {pendingCount} esperando sua aprovação
          </button>
        )}
      </header>

      <nav className="flex items-center gap-2 overflow-x-auto scrollbar-none" aria-label="Subabas de marketing">
        {TABS.map((t) => {
          const isActive = currentTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`flex items-center h-10 px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#0624C7] text-white shadow-sm border border-[#14245C]'
                  : 'text-[#9FB0E6] hover:text-white hover:bg-[#0D1948]'
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
