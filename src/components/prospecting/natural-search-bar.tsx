'use client';

import { Loader2, Search, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type LayaStatus = 'idle' | 'refining' | 'refined' | 'unavailable';

interface Props {
  value: string;
  onChange: (value: string) => void;
  layaStatus: LayaStatus;
  onFocus?: () => void;
}

const SUGGESTIONS = [
  { label: 'Convênios & Empresas', query: 'empresas e escritórios locais para fechar convênio corporativo' },
  { label: 'Noivos & Casamentos', query: 'cerimonialistas e lojas de terno para parcerias do Dia do Noivo' },
  { label: 'Cross-Promotion', query: 'academias e estúdios para parceria de público masculino' },
] as const;

const STATUS_TEXT: Record<Exclude<LayaStatus, 'idle'>, string> = {
  refining: 'Laya refinando a ordem…',
  refined: 'Ordem refinada pela Laya',
  unavailable: 'Laya desligada: ordem pelas regras básicas',
};

/** Busca ao vivo: a lista reordena a cada tecla; a Laya refina quando você para de digitar. */
export function NaturalSearchBar({ value, onChange, layaStatus, onFocus }: Props) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          placeholder="Nome, bairro ou tipo de parceria para a barbearia…"
          maxLength={200}
          aria-label="Buscar leads"
          className="h-11 pl-9 pr-9 text-base sm:text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex min-h-6 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {layaStatus === 'idle' ? (
          <>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => onChange(s.query)}
                className="rounded-full border px-2.5 py-0.5 transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </>
        ) : (
          <span className={cn('inline-flex items-center gap-1.5', layaStatus === 'refined' && 'text-primary')}>
            {layaStatus === 'refining' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {STATUS_TEXT[layaStatus]}
          </span>
        )}
      </div>
    </div>
  );
}
