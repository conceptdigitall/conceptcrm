'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowDownWideNarrow, Loader2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { LOW_CONFIDENCE, allowedValues, displayedCell } from '@/lib/prospecting/columns';
import type { ColumnKind, LeadColumn, LeadColumnValue } from '@/types';
import { Input } from '@/components/ui/input';

const KIND_LABEL: Record<ColumnKind, string> = { noul: 'sim/não', choice: 'categorias', score: 'nota' };
const PAGE = 1000;

// PostgREST caps a response at 1000 rows; 10 columns × 500 leads needs paging.
export async function fetchAllColumnValues(supabase: SupabaseClient): Promise<LeadColumnValue[]> {
  const out: LeadColumnValue[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from('lead_column_values').select('*').range(from, from + PAGE - 1);
    out.push(...((data ?? []) as LeadColumnValue[]));
    if (!data || data.length < PAGE) return out;
  }
}

export function TitleHelp() {
  return (
    <div className="rounded-md border p-3 text-xs">
      <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Como escrever o título</div>
      <ul className="space-y-0.5">
        <li><code>Quer comprar?</code> termina com ? → sim/não</li>
        <li><code>Nicho: saúde, beleza</code> tema e opções → categorias</li>
        <li><code>Parece ter dinheiro</code> outro título → nota (baixo, médio, alto)</li>
      </ul>
    </div>
  );
}

export function NewColumnInput({ disabled, onCreate }: {
  disabled: boolean;
  onCreate: (title: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const ok = await onCreate(title);
        setBusy(false);
        if (ok) setTitle('');
      }}
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nova coluna IA…"
        aria-label="Nova coluna IA"
        maxLength={120}
        disabled={disabled || busy}
        className="h-8 min-w-48 text-sm"
      />
    </form>
  );
}

export function AiColumnHeader({ column, sorted, filterValue, canEdit, onSort, onFilter, onRetry, onDelete }: {
  column: LeadColumn;
  sorted: boolean;
  filterValue: string | null;
  canEdit: boolean;
  onSort: () => void;
  onFilter: (value: string | null) => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const working = column.status === 'pending' || column.status === 'running';
  const status = column.status === 'failed' ? 'falhou' : column.status === 'done' ? 'pronta' : 'processando…';
  return (
    <div className="min-w-40 space-y-1 py-1">
      <div className="font-medium leading-tight">{column.title}</div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {KIND_LABEL[column.kind]} · {status}
        {working && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      {column.status === 'failed' && (
        <button type="button" title={column.error ?? ''} onClick={onRetry} disabled={!canEdit} className="text-xs underline">
          <RotateCcw className="inline h-3 w-3" /> Tentar de novo
        </button>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSort}
          title="Ordenar: mais prováveis primeiro"
          aria-pressed={sorted}
          className={`rounded p-0.5 ${sorted ? 'bg-muted' : ''}`}
        >
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
        </button>
        <select
          className="h-6 rounded border bg-background px-1 text-xs"
          value={filterValue ?? ''}
          onChange={(e) => onFilter(e.target.value || null)}
          aria-label={`Filtrar ${column.title}`}
        >
          <option value="">Todos</option>
          {allowedValues(column.kind, column.options).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {canEdit && (
          <button type="button" onClick={onDelete} title="Excluir coluna" className="rounded p-0.5">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function AiCell({ column, cell, disabled, onCorrect }: {
  column: LeadColumn;
  cell: LeadColumnValue | undefined;
  disabled: boolean;
  onCorrect: (value: string) => void;
}) {
  const shown = displayedCell(cell);
  const working = column.status === 'pending' || column.status === 'running';
  if (!shown && working) return <span className="text-xs text-muted-foreground">…</span>;
  const faded = shown && !shown.corrected && shown.confidence < LOW_CONFIDENCE;
  return (
    <div className={`flex items-center gap-1 text-sm ${faded ? 'opacity-50' : ''}`}>
      <select
        className="h-7 rounded border bg-background px-1 text-sm"
        value={shown?.value ?? ''}
        disabled={disabled}
        onChange={(e) => e.target.value && onCorrect(e.target.value)}
        aria-label={`Corrigir ${column.title}`}
      >
        {!shown && <option value="">—</option>}
        {allowedValues(column.kind, column.options).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      {shown && (shown.corrected
        ? <Pencil className="h-3 w-3" aria-label="corrigido à mão" />
        : <span className="text-xs tabular-nums text-muted-foreground">{Math.round(shown.confidence * 100)}%</span>)}
    </div>
  );
}
