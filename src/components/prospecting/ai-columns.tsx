'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowDownWideNarrow, Bot, GraduationCap, Loader2, MapPin, Pencil, RotateCcw,
  SlidersHorizontal, Trash2,
} from 'lucide-react';
import {
  LOW_CONFIDENCE, allowedValues, canTeach, displayedCell, formatDefinitions, learningLabel,
  parseDefinitions, runCostLabel,
} from '@/lib/prospecting/columns';
import type { ColumnKind, LeadColumn, LeadColumnValue } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

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

export function ColumnDefinitionDialog({
  column,
  open,
  onOpenChange,
  onSave,
  onSaveAndRecalculate,
}: {
  column: LeadColumn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (definition: string) => Promise<boolean>;
  onSaveAndRecalculate: (definition: string) => Promise<boolean>;
}) {
  const options = allowedValues(column.kind, column.options);
  const [defs, setDefs] = useState<Record<string, string>>(() => parseDefinitions(column.definition));
  const [busy, setBusy] = useState(false);

  const handleChange = (option: string, value: string) => {
    setDefs((prev) => ({ ...prev, [option]: value }));
  };

  const handleSave = async (andRecalculate = false) => {
    setBusy(true);
    const jsonStr = formatDefinitions(defs);
    const ok = andRecalculate ? await onSaveAndRecalculate(jsonStr) : await onSave(jsonStr);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Definições das opções — {column.title}</DialogTitle>
          <DialogDescription>
            Defina o que cada opção significa para guiar a Laya e o árbitro do Claude com precisão máxima.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto py-2">
          {options.map((opt) => (
            <div key={opt} className="space-y-1">
              <label className="text-xs font-semibold capitalize text-foreground">
                {opt}
              </label>
              <Textarea
                value={defs[opt] ?? ''}
                onChange={(e) => handleChange(opt, e.target.value)}
                placeholder={`Defina o que entra em "${opt}" (ex: termos, segmentos, bairros...)`}
                className="min-h-16 resize-none text-xs"
                disabled={busy}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void handleSave(false)}
            >
              Salvar
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={busy}
              onClick={() => void handleSave(true)}
              title="Salva as definições e recalcula a coluna mantendo correções manuais"
            >
              Salvar e Recalcular
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AiColumnHeader({
  column, sorted, filterValue, canEdit, onSort, onFilter, onRetry, onDelete, onTeach,
  onUpdateDefinition, onRecalculate,
}: {
  column: LeadColumn;
  sorted: boolean;
  filterValue: string | null;
  canEdit: boolean;
  onSort: () => void;
  onFilter: (value: string | null) => void;
  onRetry: () => void;
  onDelete: () => void;
  onTeach: () => void;
  onUpdateDefinition?: (definition: string | null) => Promise<boolean>;
  onRecalculate?: () => Promise<boolean>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const working = column.status === 'pending' || column.status === 'running';
  const status = column.status === 'failed' ? 'falhou' : column.status === 'done' ? 'pronta' : 'processando…';
  const learning = learningLabel(column);
  const cost = runCostLabel(column);
  const hasCustomDefs = Boolean(column.definition && Object.keys(parseDefinitions(column.definition)).length > 0);

  return (
    <div className="min-w-40 space-y-1 py-1">
      <div className="flex items-start justify-between gap-1">
        <div className="font-medium leading-tight">{column.title}</div>
        {canEdit && onUpdateDefinition && onRecalculate && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            title={hasCustomDefs ? 'Definições ativas (clique para editar)' : 'Definir critérios das opções para IA'}
            className={`relative rounded p-0.5 transition-colors ${
              hasCustomDefs ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {hasCustomDefs && (
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {KIND_LABEL[column.kind]} · {status}
        {working && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      {(learning || cost) && (
        <div className="text-xs text-muted-foreground">
          {[learning, cost].filter(Boolean).join(' · ')}
        </div>
      )}
      {canEdit && canTeach(column) && (
        <button
          type="button"
          onClick={onTeach}
          title="O Claude rotula 30 leads uma vez (centavos) e a coluna aprende com eles"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <GraduationCap className="h-3 w-3" /> Ensinar com Claude
        </button>
      )}
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

      {canEdit && onUpdateDefinition && onRecalculate && dialogOpen && (
        <ColumnDefinitionDialog
          key={`${column.id}-${column.definition ?? ''}`}
          column={column}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSave={async (def) => onUpdateDefinition(def)}
          onSaveAndRecalculate={async (def) => {
            const ok = await onUpdateDefinition(def);
            if (ok) return onRecalculate();
            return false;
          }}
        />
      )}
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
      {shown && !shown.corrected && cell?.source === 'cabeca' && (
        <GraduationCap className="h-3 w-3 text-muted-foreground" aria-label="decidido pela coluna treinada" />
      )}
      {shown && !shown.corrected && cell?.source === 'claude' && (
        <Bot className="h-3 w-3 text-muted-foreground" aria-label="decidido pelo Claude" />
      )}
      {shown && !shown.corrected && cell?.source === 'regra' && (
        <MapPin className="h-3 w-3 text-muted-foreground" aria-label="decidido pela regra de região" />
      )}
    </div>
  );
}
