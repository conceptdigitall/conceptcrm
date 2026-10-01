'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ExternalLink, LayoutGrid, MessageCircle, Plus, RotateCcw, Sheet, Star, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { hasStalePending } from '@/lib/jobs/stale';
import { safeHttpUrl } from '@/lib/prospecting/url';
import type { Lead, LeadColumn, LeadColumnValue, LeadSearch, LeadStatus } from '@/types';
import { displayedCell, sortScore } from '@/lib/prospecting/columns';
import { AiCell, AiColumnHeader, NewColumnInput, TitleHelp, fetchAllColumnValues } from '@/components/prospecting/ai-columns';
import { SATISFACTION_LABEL, buildOutreachMessage, satisfactionLevel, whatsappUrl, type SatisfactionLevel } from '@/lib/prospecting/outreach';
import { SearchForm, type SearchInput } from '@/components/prospecting/search-form';
import { NaturalSearchBar, type LayaStatus } from '@/components/prospecting/natural-search-bar';
import { LeadCard, STATUS_LABEL } from '@/components/prospecting/lead-card';
import {
  extractDistinctRegions,
  extractAudienceList,
  getLeadAudience,
  normalizeText,
  rankLeads,
  compareRanked,
  type LeadRankingResult,
} from '@/lib/prospecting/dynamic-search';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LAYA_TOP_N = 12;

const STATUS_TABS: { value: LeadStatus | 'todos'; label: string }[] = [
  { value: 'novo', label: 'Novos' },
  { value: 'contatado', label: 'Contatados' },
  { value: 'qualificado', label: 'Qualificados' },
  { value: 'todos', label: 'Todos' },
];
const JOB_LABEL = { pending: 'Na fila', running: 'Buscando…', done: 'Concluída', failed: 'Erro' } as const;
const SATISFACTION_TONE: Record<SatisfactionLevel, string> = {
  'muito-alta': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  alta: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  media: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  baixa: 'bg-red-500/10 text-red-700 dark:text-red-300',
  'sem-dados': 'bg-muted text-muted-foreground',
};

function scoreTone(score: number): string {
  if (score >= 60) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (score >= 40) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  return 'bg-muted text-muted-foreground';
}

export default function ProspeccaoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId } = useAuth();
  const canEdit = useCan('send-messages');

  const [searches, setSearches] = useState<LeadSearch[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'todos'>('novo');
  const [now, setNow] = useState(() => Date.now());
  const [columns, setColumns] = useState<LeadColumn[]>([]);
  const [values, setValues] = useState<LeadColumnValue[]>([]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [valueFilter, setValueFilter] = useState<{ columnId: string; value: string } | null>(null);
  const [query, setQuery] = useState('');
  const [laya, setLaya] = useState<{ key: string; map: Map<string, LeadRankingResult> } | null>(null);
  const [layaStatus, setLayaStatus] = useState<LayaStatus>('idle');
  const layaCache = useRef(new Map<string, Map<string, LeadRankingResult> | null>());
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedAudience, setSelectedAudience] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState<boolean | null>(null);
  const [view, setView] = useState<'cards' | 'planilha'>('cards');

  const fetchData = useCallback(async () => {
    const [s, l, c, v] = await Promise.all([
      supabase.from('lead_searches').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('leads').select('*').order('score', { ascending: false }).limit(500),
      supabase.from('lead_columns').select('*').order('created_at', { ascending: true }),
      fetchAllColumnValues(supabase),
    ]);
    return {
      searches: (s.data ?? []) as LeadSearch[],
      leads: (l.data ?? []) as Lead[],
      columns: (c.data ?? []) as LeadColumn[],
      values: v,
    };
  }, [supabase]);

  const load = useCallback(() => {
    if (!accountId) return;
    fetchData().then((d) => {
      setSearches(d.searches);
      setLeads(d.leads);
      setColumns(d.columns);
      setValues(d.values);
      setNow(Date.now());
    });
  }, [fetchData, accountId]);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    fetchData().then((d) => {
      if (!active) return;
      setLoaded(true);
      setSearches(d.searches);
      setLeads(d.leads);
      setColumns(d.columns);
      setValues(d.values);
      setNow(Date.now());
    });
    return () => {
      active = false;
    };
  }, [fetchData, accountId]);

  const busy = searches.some((s) => s.status === 'pending' || s.status === 'running')
    || columns.some((c) => c.status === 'pending' || c.status === 'running');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function createSearch(inputs: SearchInput[]): Promise<boolean> {
    let queued = 0;
    for (const input of inputs) {
      const res = await fetch('/api/prospecting/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) queued += 1;
      else toast.error(`${input.location}: ${json.error ?? 'não foi possível criar a busca'}`);
    }
    if (queued === 0) return false;
    toast.success(
      queued === 1 ? 'Busca na fila. Os leads aparecem aqui quando o worker terminar.' : `${queued} buscas na fila, uma por cidade.`,
    );
    setFormOpen(false);
    load();
    return true;
  }

  async function retry(id: string) {
    const res = await fetch(`/api/prospecting/searches/${id}/retry`, { method: 'POST' });
    if (!res.ok) return toast.error('Não foi possível tentar de novo');
    load();
  }

  async function promote(lead: Lead) {
    const res = await fetch(`/api/prospecting/leads/${lead.id}/promote`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.error ?? 'Falha ao promover');
    toast.success(json.existing ? 'Já era um contato. Lead vinculado.' : 'Contato criado.');
    load();
  }

  async function setStatus(lead: Lead, status: LeadStatus) {
    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (error) return toast.error(error.message);
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
  }

  async function createColumn(title: string): Promise<boolean> {
    const res = await fetch('/api/prospecting/columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? 'Não foi possível criar a coluna');
      return false;
    }
    toast.success('Coluna na fila. O Laya preenche com o worker e o npm run laya rodando.');
    load();
    return true;
  }

  async function retryColumn(id: string) {
    const res = await fetch(`/api/prospecting/columns/${id}/retry`, { method: 'POST' });
    if (!res.ok) return toast.error('Não foi possível tentar de novo');
    load();
  }

  async function deleteColumn(column: LeadColumn) {
    if (!window.confirm(`Excluir a coluna "${column.title}"? As correções dela também somem.`)) return;
    const res = await fetch(`/api/prospecting/columns/${column.id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Não foi possível excluir a coluna');
    if (sortBy === column.id) setSortBy(null);
    if (valueFilter?.columnId === column.id) setValueFilter(null);
    load();
  }

  async function correct(column: LeadColumn, lead: Lead, value: string) {
    const res = await fetch(`/api/prospecting/columns/${column.id}/values/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.error ?? 'Não foi possível corrigir');
    const row = json.value as LeadColumnValue;
    setValues((prev) => [
      ...prev.filter((v) => !(v.column_id === row.column_id && v.lead_id === row.lead_id)),
      row,
    ]);
  }

  const cells = useMemo(
    () => new Map(values.map((v) => [`${v.column_id}:${v.lead_id}`, v])),
    [values],
  );

  // Opening WhatsApp doesn't prove a message was sent, so the status change is undoable.
  function onApproach(lead: Lead) {
    if (!canEdit || lead.status !== 'novo') return;
    void setStatus(lead, 'contatado');
    toast.success(`${lead.name} marcado como contatado`, {
      action: { label: 'Desfazer', onClick: () => void setStatus({ ...lead, status: 'contatado' }, 'novo') },
    });
  }

  const cellOf = (columnId: string, leadId: string) => cells.get(`${columnId}:${leadId}`);

  const regions = useMemo(() => extractDistinctRegions(leads), [leads]);
  const audiences = useMemo(() => extractAudienceList(leads), [leads]);

  const filtered = leads.filter((l) => {
    if (statusFilter !== 'todos' && l.status !== statusFilter) return false;
    if (valueFilter && displayedCell(cellOf(valueFilter.columnId, l.id))?.value !== valueFilter.value) return false;
    if (selectedRegion) {
      const regNorm = selectedRegion.toLowerCase();
      const raw = (l.raw ?? {}) as Record<string, unknown>;
      const comp = (raw.complete_address ?? {}) as Record<string, unknown>;
      const full = `${comp.borough ?? ''} ${comp.city ?? ''} ${l.address ?? ''}`.toLowerCase();
      if (!full.includes(regNorm)) return false;
    }
    if (selectedAudience && getLeadAudience(l) !== selectedAudience) return false;
    return true;
  });

  const valuesByLead = useMemo(() => {
    const m = new Map<string, LeadColumnValue[]>();
    for (const v of values) m.set(v.lead_id, [...(m.get(v.lead_id) ?? []), v]);
    return m;
  }, [values]);

  const queryKey = normalizeText(query);
  const searching = queryKey.length >= 2;
  // Laya costs ~65 ms per lead, so it only refines the top of the instant ranking (what's on screen).
  const candidateIds = useMemo(() => {
    if (!searching) return '';
    const instant = rankLeads(filtered, query, valuesByLead);
    return [...filtered]
      .sort((a, b) => compareRanked(instant.get(a.id), instant.get(b.id)))
      .slice(0, LAYA_TOP_N)
      .map((l) => l.id)
      .join(',');
    // `filtered` is rebuilt every render; its ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, query, valuesByLead, filtered.map((l) => l.id).join(',')]);
  const layaKey = `${queryKey}|${candidateIds}`;

  // Laya runs on one Mac and can't cancel a call already started, so at most one request
  // is in flight; while it runs, only the newest pending search is kept and sent next.
  const currentKey = useRef('');
  const inFlight = useRef(false);
  const queued = useRef<{ key: string; query: string; ids: string[] } | null>(null);

  const lastWarm = useRef(0);
  const warmLaya = useCallback(() => {
    if (Date.now() - lastWarm.current < 60_000) return;
    lastWarm.current = Date.now();
    void fetch('/api/prospecting/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warm: true }),
    }).catch(() => {});
  }, []);

  const runLaya = useCallback(async (job: { key: string; query: string; ids: string[] }) => {
    inFlight.current = true;
    let map: Map<string, LeadRankingResult> | null = null;
    try {
      const res = await fetch('/api/prospecting/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: job.query, leadIds: job.ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.laya) {
        map = new Map(((json.results ?? []) as LeadRankingResult[]).map((r) => [r.leadId, r]));
      }
    } catch {
      // Rede caiu: segue com a ordem instantânea.
    }
    layaCache.current.set(job.key, map);
    if (currentKey.current === job.key) {
      setLaya(map ? { key: job.key, map } : null);
      setLayaStatus(map ? 'refined' : 'unavailable');
    }
    inFlight.current = false;
    const next = queued.current;
    queued.current = null;
    if (next && next.key === currentKey.current && !layaCache.current.has(next.key)) void runLaya(next);
  }, []);

  useEffect(() => {
    currentKey.current = layaKey;
    if (!searching || queryKey.length < 4) {
      setLayaStatus('idle');
      return;
    }
    if (layaCache.current.has(layaKey)) {
      const cached = layaCache.current.get(layaKey) ?? null;
      setLaya(cached ? { key: layaKey, map: cached } : null);
      setLayaStatus(cached ? 'refined' : 'unavailable');
      return;
    }
    const timer = setTimeout(() => {
      const job = { key: layaKey, query: query.trim(), ids: candidateIds.split(',').filter(Boolean) };
      setLayaStatus('refining');
      if (inFlight.current) queued.current = job;
      else void runLaya(job);
    }, 700);
    return () => clearTimeout(timer);
    // `query` and `candidateIds` are part of `layaKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layaKey, searching]);

  const ranked = useMemo(
    () => (searching ? rankLeads(filtered, query, valuesByLead, laya?.key === layaKey ? laya.map : null) : null),
    [searching, filtered, query, valuesByLead, laya, layaKey],
  );

  const sortColumn = columns.find((c) => c.id === sortBy);
  const visible = sortColumn
    ? [...filtered].sort((a, b) =>
        sortScore(sortColumn.kind, sortColumn.options, cellOf(sortColumn.id, b.id))
        - sortScore(sortColumn.kind, sortColumn.options, cellOf(sortColumn.id, a.id)))
    : ranked
    ? [...filtered].sort((a, b) => compareRanked(ranked.get(a.id), ranked.get(b.id)))
    : filtered;

  const lastDone = columns
    .filter((c) => c.status === 'done' && c.finished_at)
    .sort((a, b) => ((a.finished_at ?? '') < (b.finished_at ?? '') ? 1 : -1))[0];

  const showForm = formOpen ?? (loaded && leads.length === 0);
  const activeJobs = searches.filter((x) => x.status !== 'done');
  const doneJobs = searches.filter((x) => x.status === 'done');
  const countByStatus = (st: LeadStatus | 'todos') => (st === 'todos' ? leads.length : leads.filter((l) => l.status === st).length);
  const hasFilters = Boolean(selectedRegion || selectedAudience);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Negócios do Google Maps. Nenhuma mensagem é enviada sozinha: você revisa e envia.
        </p>
        <Button onClick={() => setFormOpen(!showForm)} variant={showForm ? 'outline' : 'default'} disabled={!canEdit}>
          {showForm ? <X className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
          {showForm ? 'Fechar' : 'Nova busca'}
        </Button>
      </div>

      {hasStalePending(searches, now) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Há buscas esperando há mais de 10 minutos. O worker está ligado no Mac? (docs/worker.md)
        </div>
      )}

      {showForm && (
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <SearchForm disabled={!canEdit} onSubmit={createSearch} />
        </section>
      )}

      {(activeJobs.length > 0 || doneJobs.length > 0) && (
        <div className="space-y-2 text-sm">
          {activeJobs.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', x.status === 'failed' ? 'bg-red-500' : 'animate-pulse bg-primary')} />
              <span className="min-w-0 flex-1 truncate">
                {x.query} em {x.location}: <strong>{JOB_LABEL[x.status]}</strong>
              </span>
              {x.status === 'failed' && (
                <button type="button" title={x.error ?? ''} onClick={() => retry(x.id)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <RotateCcw className="h-3 w-3" /> tentar de novo
                </button>
              )}
            </div>
          ))}
          {doneJobs.length > 0 && (
            <details className="group text-muted-foreground">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs hover:text-foreground">
                <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                Buscas concluídas ({doneJobs.length})
              </summary>
              <ul className="mt-2 flex flex-wrap gap-2">
                {doneJobs.map((x) => (
                  <li key={x.id} className="rounded-full border px-3 py-1 text-xs">
                    {x.query} · {x.location} · {x.result_count ?? 0} novos
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <NaturalSearchBar
          value={query}
          onChange={setQuery}
          layaStatus={searching ? layaStatus : 'idle'}
          onFocus={warmLaya}
        />

        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Status dos leads">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors',
                statusFilter === tab.value ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {tab.label} <span className="opacity-70">{countByStatus(tab.value)}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <select
            aria-label="Região"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={selectedRegion ?? ''}
            onChange={(e) => setSelectedRegion(e.target.value || null)}
          >
            <option value="">Todas as regiões</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            aria-label="Tipo de negócio"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={selectedAudience ?? ''}
            onChange={(e) => setSelectedAudience(e.target.value || null)}
          >
            <option value="">Todos os negócios</option>
            {audiences.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="col-span-2 inline-flex rounded-md border p-0.5 sm:col-span-1 sm:ml-auto" role="group" aria-label="Modo de visualização">
            {([['cards', LayoutGrid, 'Cartões'], ['planilha', Sheet, 'Planilha']] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn('inline-flex flex-1 items-center justify-center gap-1 rounded px-2.5 py-1 text-xs', view === v ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{loaded ? `${visible.length} ${visible.length === 1 ? 'lead' : 'leads'}${ranked ? ', do mais provável ao menos provável' : ''}` : 'Carregando…'}</span>
          {hasFilters && (
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => {
                setSelectedRegion(null);
                setSelectedAudience(null);
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        {!loaded ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl border bg-muted/50" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {leads.length === 0 ? 'Nenhum lead ainda. Clique em "Nova busca" para começar.' : 'Nenhum lead com esses filtros.'}
          </div>
        ) : view === 'cards' ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((l) => (
              <LeadCard
                key={l.id}
                lead={l}
                rank={ranked?.get(l.id)?.result}
                canEdit={canEdit}
                onApproach={onApproach}
                onPromote={promote}
                onStatus={setStatus}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start gap-4">
              <TitleHelp />
              {lastDone && (
                <p className="text-sm text-muted-foreground">
                  “{lastDone.title}”: {lastDone.filled_count ?? 0} linhas preenchidas em{' '}
                  {((lastDone.duration_ms ?? 0) / 1000).toFixed(1).replace('.', ',')} s
                </p>
              )}
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Oportunidade</TableHead>
                    {ranked && <TableHead className="min-w-[140px]">Chance de fechar</TableHead>}
                    <TableHead>Negócio</TableHead>
                    <TableHead>Satisfação</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                    {columns.map((c) => (
                      <TableHead key={c.id} className="align-top">
                        <AiColumnHeader
                          column={c}
                          sorted={sortBy === c.id}
                          filterValue={valueFilter?.columnId === c.id ? valueFilter.value : null}
                          canEdit={canEdit}
                          onSort={() => setSortBy((cur) => (cur === c.id ? null : c.id))}
                          onFilter={(value) => setValueFilter(value ? { columnId: c.id, value } : null)}
                          onRetry={() => retryColumn(c.id)}
                          onDelete={() => deleteColumn(c)}
                        />
                      </TableHead>
                    ))}
                    <TableHead className="align-top">
                      <NewColumnInput disabled={!canEdit} onCreate={createColumn} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((l) => {
                    const rank = ranked?.get(l.id)?.result;
                    const level = satisfactionLevel(l.rating, l.review_count);
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <span className={cn('inline-flex rounded-md px-2 py-0.5 text-sm font-semibold', scoreTone(l.score))}>{l.score}</span>
                        </TableCell>
                        {ranked && (
                          <TableCell className="text-xs">{rank ? `${rank.probability}%` : '—'}</TableCell>
                        )}
                        <TableCell>
                          <div className="font-medium">{l.name}</div>
                          <div className="text-xs text-muted-foreground">{l.category}</div>
                        </TableCell>
                        <TableCell>
                          <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', SATISFACTION_TONE[level])}>
                            {SATISFACTION_LABEL[level]}
                          </span>
                          {l.rating != null && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="h-3 w-3 fill-current text-amber-500" /> {l.rating} ({l.review_count ?? 0})
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{l.phone ?? '—'}</TableCell>
                        <TableCell>
                          <select
                            className="h-8 rounded-md border bg-background px-2 text-sm"
                            value={l.status}
                            disabled={!canEdit}
                            onChange={(e) => setStatus(l, e.target.value as LeadStatus)}
                          >
                            {Object.entries(STATUS_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                          </select>
                        </TableCell>
                        <TableCell className="space-x-1 whitespace-nowrap">
                          {l.phone && l.is_mobile && (
                            <a
                              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                              title="Abordar no WhatsApp"
                              href={whatsappUrl(l.phone, buildOutreachMessage(l))}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => onApproach(l)}
                            >
                              <MessageCircle className="h-4 w-4 text-[#25D366]" />
                            </a>
                          )}
                          {safeHttpUrl(l.maps_url) && (
                            <a className={buttonVariants({ variant: 'ghost', size: 'icon' })} title="Abrir no Maps" href={safeHttpUrl(l.maps_url) ?? undefined} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          <Button variant="ghost" size="icon" disabled={!canEdit || !l.phone || Boolean(l.contact_id)} title="Salvar nos Contatos" onClick={() => promote(l)}>
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        {columns.map((c) => (
                          <TableCell key={c.id}>
                            <AiCell column={c} cell={cellOf(c.id, l.id)} disabled={!canEdit} onCorrect={(value) => correct(c, l, value)} />
                          </TableCell>
                        ))}
                        <TableCell />
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
