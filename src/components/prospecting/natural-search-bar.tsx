'use client';

import { useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface NaturalSearchBarProps {
  onSearch: (query: string) => Promise<void>;
  onClear: () => void;
  activeQuery: string | null;
  loading: boolean;
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
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Pergunte à Laya: quem tem mais chance de comprar…"
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
        <span>Experimente:</span>
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

      {activeQuery && (
        <p className="rounded-md bg-primary/10 px-3 py-1.5 text-xs text-primary">
          Ordenado por chance de fechar para <strong>“{activeQuery}”</strong>, da maior para a menor.
        </p>
      )}
    </div>
  );
}
