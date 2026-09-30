'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, MessageCircle, RotateCcw, Search, UserPlus, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { hasStalePending } from '@/lib/jobs/stale';
import { safeHttpUrl } from '@/lib/prospecting/url';
import type { Lead, LeadColumn, LeadColumnValue, LeadSearch, LeadStatus } from '@/types';
import { displayedCell, sortScore } from '@/lib/prospecting/columns';
import { AiCell, AiColumnHeader, NewColumnInput, TitleHelp, fetchAllColumnValues } from '@/components/prospecting/ai-columns';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novo', contatado: 'Contatado', qualificado: 'Qualificado', descartado: 'Descartado',
};
const JOB_LABEL = { pending: 'Na fila', running: 'Buscando…', done: 'Concluída', failed: 'Erro' } as const;

export default function ProspeccaoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId } = useAuth();
  const canEdit = useCan('send-messages');

  const [searches, setSearches] = useState<LeadSearch[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('Santos, SP');
  const [maxResults, setMaxResults] = useState(50);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'todos'>('novo');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [columns, setColumns] = useState<LeadColumn[]>([]);
  const [values, setValues] = useState<LeadColumnValue[]>([]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [valueFilter, setValueFilter] = useState<{ columnId: string; value: string } | null>(null);

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

  async function createSearch(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch('/api/prospecting/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location, maxResults }),
    });
    setSubmitting(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.error ?? 'Não foi possível criar a busca');
    toast.success('Busca na fila. O worker processa quando estiver rodando.');
    setQuery('');
    load();
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
  const cellOf = (columnId: string, leadId: string) => cells.get(`${columnId}:${leadId}`);

  const filtered = leads.filter((l) =>
    (statusFilter === 'todos' || l.status === statusFilter) &&
    (!text || `${l.name} ${l.address ?? ''} ${l.category ?? ''}`.toLowerCase().includes(text.toLowerCase())) &&
    (!valueFilter || displayedCell(cellOf(valueFilter.columnId, l.id))?.value === valueFilter.value),
  );
  const sortColumn = columns.find((c) => c.id === sortBy);
  const visible = sortColumn
    ? [...filtered].sort((a, b) =>
        sortScore(sortColumn.kind, sortColumn.options, cellOf(sortColumn.id, b.id))
        - sortScore(sortColumn.kind, sortColumn.options, cellOf(sortColumn.id, a.id)))
    : filtered;

  const lastDone = columns
    .filter((c) => c.status === 'done' && c.finished_at)
    .sort((a, b) => ((a.finished_at ?? '') < (b.finished_at ?? '') ? 1 : -1))[0];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Prospecção</h1>
        <p className="text-sm text-muted-foreground">
          Negócios do Google Maps, ordenados por oportunidade. Uso interno: nenhuma mensagem é enviada automaticamente.
        </p>
      </div>

      {hasStalePending(searches, now) && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4" />
          Há buscas na fila há mais de 10 minutos. O worker está rodando? (veja docs/worker.md)
        </div>
      )}

      <form onSubmit={createSearch} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="flex flex-col gap-1 text-sm">O que buscar
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="barbearia, imobiliária…" required maxLength={120} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Cidade
          <Input value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={120} />
        </label>
        <label className="flex w-28 flex-col gap-1 text-sm">Quantidade
          <Input type="number" min={1} max={200} value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} />
        </label>
        <Button type="submit" disabled={!canEdit || submitting}>
          <Search className="mr-2 h-4 w-4" /> Buscar
        </Button>
      </form>

      {searches.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {searches.slice(0, 8).map((s) => (
            <span key={s.id} className="flex items-center gap-2 rounded-full border px-3 py-1">
              {s.query} · {s.location} · {JOB_LABEL[s.status]}
              {s.status === 'done' && ` (${s.result_count ?? 0} novos)`}
              {s.status === 'failed' && (
                <button type="button" title={s.error ?? ''} onClick={() => retry(s.id)} className="underline">
                  <RotateCcw className="inline h-3 w-3" /> tentar de novo
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'todos')}
        >
          <option value="todos">Todos</option>
          {Object.entries(STATUS_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <Input className="max-w-xs" placeholder="Filtrar por nome, bairro…" value={text} onChange={(e) => setText(e.target.value)} />
        <span className="text-sm text-muted-foreground">{visible.length} leads</span>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <TitleHelp />
        {lastDone && (
          <p className="text-sm text-muted-foreground">
            “{lastDone.title}”: {lastDone.filled_count ?? 0} linhas preenchidas em{' '}
            {((lastDone.duration_ms ?? 0) / 1000).toFixed(1).replace('.', ',')} s
          </p>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Score</TableHead>
            <TableHead>Negócio</TableHead>
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
          {visible.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <div className="font-semibold">{l.score}</div>
                <div className="text-xs text-muted-foreground">{l.score_reasons.join(' · ')}</div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {l.category} {l.rating ? `· ${l.rating}★ (${l.review_count ?? 0})` : ''}
                </div>
                <div className="text-xs text-muted-foreground">{l.address}</div>
              </TableCell>
              <TableCell className="text-sm">
                <div>{l.phone ?? '—'}</div>
                {safeHttpUrl(l.website) && <a className="text-xs underline" href={safeHttpUrl(l.website) ?? undefined} target="_blank" rel="noreferrer">site</a>}
                {l.email && <div className="text-xs">{l.email}</div>}
              </TableCell>
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
                {safeHttpUrl(l.maps_url) && (
                  <a className={buttonVariants({ variant: 'ghost', size: 'icon' })} title="Abrir no Maps" href={safeHttpUrl(l.maps_url) ?? undefined} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {l.phone && l.is_mobile && (
                  <a className={buttonVariants({ variant: 'ghost', size: 'icon' })} title="Abrir WhatsApp (manual)" href={`https://wa.me/${l.phone}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" />
                  </a>
                )}
                <Button
                  variant="outline" size="sm"
                  disabled={!canEdit || !l.phone || Boolean(l.contact_id)}
                  title={!l.phone ? 'Lead sem telefone' : l.contact_id ? 'Já é contato' : 'Promover para Contato'}
                  onClick={() => promote(l)}
                >
                  <UserPlus className="mr-1 h-4 w-4" /> {l.contact_id ? 'Contato' : 'Promover'}
                </Button>
              </TableCell>
              {columns.map((c) => (
                <TableCell key={c.id}>
                  <AiCell
                    column={c}
                    cell={cellOf(c.id, l.id)}
                    disabled={!canEdit}
                    onCorrect={(value) => correct(c, l, value)}
                  />
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
