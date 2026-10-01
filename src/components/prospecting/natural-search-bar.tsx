'use client';

import { useState } from 'react';
import { Sparkles, X, Loader2, Filter, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface NaturalSearchBarProps {
  onSearch: (query: string) => Promise<void>;
  onClear: () => void;
  activeQuery: string | null;
  loading: boolean;
  regions: string[];
  selectedRegion: string | null;
  onSelectRegion: (region: string | null) => void;
  audiences: string[];
  selectedAudience: string | null;
  onSelectAudience: (audience: string | null) => void;
}

const QUICK_SUGGESTIONS = [
  { label: '🤖 Recepcionista de IA', query: 'leads mais qualificados para comprar recepcionista de IA' },
  { label: '📈 Alto Faturamento', query: 'negócios com alto faturamento e volume de clientes' },
  { label: '🌐 Sem Site Próprio', query: 'empresas sem site que precisam de presença digital' },
] as const;

export function NaturalSearchBar({
  onSearch,
  onClear,
  activeQuery,
  loading,
  regions,
  selectedRegion,
  onSelectRegion,
  audiences,
  selectedAudience,
  onSelectAudience,
}: NaturalSearchBarProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;
    void onSearch(inputValue.trim());
  };

  const handleSuggestion = (query: string) => {
    setInputValue(query);
    void onSearch(query);
  };

  const handleClear = () => {
    setInputValue('');
    onClear();
  };

  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.02] p-4 sm:p-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Buscar com IA (ex.: leads qualificados para recepcionista de IA)…"
            disabled={loading}
            className="h-10 pl-9 pr-8 text-sm focus-visible:ring-primary/30"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Limpar texto"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={loading || !inputValue.trim()}
            className="h-10 flex-1 gap-1.5 sm:flex-none"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Laya analisando…</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Priorizar com Laya</span>
              </>
            )}
          </Button>

          {activeQuery && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              disabled={loading}
              className="h-10 border-border text-muted-foreground hover:text-foreground"
              title="Voltar à ordenação normal"
            >
              <X className="mr-1 h-4 w-4" /> Limpar
            </Button>
          )}
        </div>
      </form>

      {/* Sugestões Rápidas (Lei de Hick: 1 clique para decidir) */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">Sugestões:</span>
        {QUICK_SUGGESTIONS.map((sug) => (
          <button
            key={sug.label}
            type="button"
            disabled={loading}
            onClick={() => handleSuggestion(sug.query)}
            className={cn(
              'inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-muted active:scale-95 disabled:opacity-50',
              activeQuery === sug.query && 'border-primary bg-primary/10 font-medium text-primary',
            )}
          >
            {sug.label}
          </button>
        ))}
      </div>

      {/* Filtros compactos: Região e Tipo de Público */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
          <Filter className="h-3.5 w-3.5" />
          <span>Filtros:</span>
        </div>

        {/* Filtro de Região */}
        <div className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            className="h-8 max-w-[180px] truncate rounded-md border border-border bg-background px-2 text-xs"
            value={selectedRegion ?? ''}
            onChange={(e) => onSelectRegion(e.target.value || null)}
          >
            <option value="">Todas as regiões ({regions.length})</option>
            {regions.map((reg) => (
              <option key={reg} value={reg}>
                {reg}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro de Tipo de Público */}
        <div className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            className="h-8 max-w-[180px] truncate rounded-md border border-border bg-background px-2 text-xs"
            value={selectedAudience ?? ''}
            onChange={(e) => onSelectAudience(e.target.value || null)}
          >
            <option value="">Todos os públicos</option>
            {audiences.map((aud) => (
              <option key={aud} value={aud}>
                {aud}
              </option>
            ))}
          </select>
        </div>

        {(selectedRegion || selectedAudience) && (
          <button
            type="button"
            onClick={() => {
              onSelectRegion(null);
              onSelectAudience(null);
            }}
            className="text-xs text-muted-foreground underline hover:text-foreground ml-auto"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {activeQuery && (
        <div className="rounded-md bg-primary/10 px-3 py-1.5 text-xs text-primary flex items-center justify-between">
          <span>
            Ordenando por potencial para: <strong>“{activeQuery}”</strong> (do maior para o menor)
          </span>
          <span className="text-[11px] opacity-80">Laya AI Rank</span>
        </div>
      )}
    </div>
  );
}
