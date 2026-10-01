'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, MessageCircle, RotateCcw, Star, UserPlus, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { hasStalePending } from '@/lib/jobs/stale';
import { safeHttpUrl } from '@/lib/prospecting/url';
import { SATISFACTION_LABEL, buildOutreachMessage, satisfactionLevel, whatsappUrl, type SatisfactionLevel } from '@/lib/prospecting/outreach';
import { SearchForm, type SearchInput } from '@/components/prospecting/search-form';
import { cn } from '@/lib/utils';
import type { Lead, LeadSearch, LeadStatus } from '@/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novo', contatado: 'Contatado', qualificado: 'Qualificado', descartado: 'Descartado',
};
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
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const fetchData = useCallback(async () => {
    const [s, l] = await Promise.all([
      supabase.from('lead_searches').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('leads').select('*').order('score', { ascending: false }).limit(500),
    ]);
    return { searches: (s.data ?? []) as LeadSearch[], leads: (l.data ?? []) as Lead[] };
  }, [supabase]);

  const load = useCallback(() => {
    if (!accountId) return;
    fetchData().then((d) => {
      setSearches(d.searches);
      setLeads(d.leads);
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
      setNow(Date.now());
    });
    return () => {
      active = false;
    };
  }, [fetchData, accountId]);

  const busy = searches.some((s) => s.status === 'pending' || s.status === 'running');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function createSearch(input: SearchInput): Promise<boolean> {
    const res = await fetch('/api/prospecting/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? 'Não foi possível criar a busca');
      return false;
    }
    toast.success('Busca na fila. O worker processa quando estiver rodando.');
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

  // Opening WhatsApp doesn't prove a message was sent, so the status change is undoable.
  function onApproach(lead: Lead) {
    if (!canEdit || lead.status !== 'novo') return;
    void setStatus(lead, 'contatado');
    toast.success(`${lead.name} marcado como contatado`, {
      action: { label: 'Desfazer', onClick: () => void setStatus({ ...lead, status: 'contatado' }, 'novo') },
    });
  }

  const visible = leads.filter((l) =>
    (statusFilter === 'todos' || l.status === statusFilter) &&
    (!text || `${l.name} ${l.address ?? ''} ${l.category ?? ''}`.toLowerCase().includes(text.toLowerCase())),
  );

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

      <SearchForm disabled={!canEdit} onSubmit={createSearch} />

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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Oportunidade</TableHead>
            <TableHead>Negócio</TableHead>
            <TableHead>Satisfação dos clientes</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <span className={cn('inline-flex rounded-md px-2 py-0.5 text-sm font-semibold', scoreTone(l.score))}>{l.score}</span>
                <div className="mt-1 text-xs text-muted-foreground">{l.score_reasons.join(' · ')}</div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">{l.category}</div>
                <div className="text-xs text-muted-foreground">{l.address}</div>
              </TableCell>
              <TableCell>
                {(() => {
                  const level = satisfactionLevel(l.rating, l.review_count);
                  return (
                    <div className="space-y-1">
                      <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', SATISFACTION_TONE[level])}>
                        {SATISFACTION_LABEL[level]}
                      </span>
                      {l.rating != null && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 fill-current text-amber-500" /> {l.rating} · {l.review_count ?? 0} avaliações
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                {l.phone && l.is_mobile ? (
                  <a
                    className={cn(buttonVariants({ size: 'sm' }), 'bg-[#25D366] text-white hover:bg-[#1ebe5a]')}
                    href={whatsappUrl(l.phone, buildOutreachMessage(l))}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onApproach(l)}
                  >
                    <MessageCircle className="mr-1 h-4 w-4" /> Abordar no WhatsApp
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground" title="Telefone fixo ou ausente">Sem WhatsApp</span>
                )}
                {safeHttpUrl(l.maps_url) && (
                  <a className={buttonVariants({ variant: 'ghost', size: 'icon' })} title="Abrir no Maps" href={safeHttpUrl(l.maps_url) ?? undefined} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
