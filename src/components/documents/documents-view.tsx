'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  Search,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  Copy,
  ExternalLink,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { ContractWithContact, ContractStatus } from '@/types/contracts';
import { fetchAllAccountContracts, updateContract, deleteContract } from '@/lib/contracts/api';
import { generateContractDraft, formatBRL } from '@/lib/contracts/minuta-generator';

export function DocumentsView() {
  const supabase = createClient();
  const { accountId } = useAuth();
  const [contracts, setContracts] = useState<ContractWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const data = await fetchAllAccountContracts(supabase, accountId);
      setContracts(data);
    } catch {
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        (c.contact?.name || '').toLowerCase().includes(q) ||
        (c.contact?.company || '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [contracts, statusFilter, search]);

  // Metrics
  const metrics = useMemo(() => {
    const total = contracts.length;
    const signed = contracts.filter((c) => c.status === 'assinado');
    const totalSetup = signed.reduce((acc, c) => acc + (Number(c.setup_price) || 0), 0);
    const mrr = signed.reduce((acc, c) => acc + (c.type === 'recorrente' ? Number(c.monthly_price) || 0 : 0), 0);
    return { total, signedCount: signed.length, totalSetup, mrr };
  }, [contracts]);

  const handleCopyDraft = (contract: ContractWithContact) => {
    const text = generateContractDraft(
      {
        name: contract.contact?.name,
        company: contract.contact?.company,
        phone: contract.contact?.phone,
        email: contract.contact?.email,
      },
      {
        title: contract.title,
        type: contract.type,
        status: contract.status,
        setup_price: contract.setup_price,
        monthly_price: contract.monthly_price,
        billing_day: contract.billing_day,
        notes: contract.notes || undefined,
      }
    );

    navigator.clipboard.writeText(text);
    toast.success('Minuta copiada!');
  };

  const handleStatusChange = async (id: string, newStatus: ContractStatus) => {
    try {
      await updateContract(supabase, id, { status: newStatus });
      toast.success('Status atualizado');
      loadData();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este contrato permanentemente?')) return;
    try {
      await deleteContract(supabase, id);
      toast.success('Contrato excluído');
      loadData();
    } catch {
      toast.error('Erro ao excluir contrato');
    }
  };

  const getStatusBadge = (s: ContractStatus) => {
    switch (s) {
      case 'assinado':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"><CheckCircle2 className="size-3 mr-1" /> Assinado</Badge>;
      case 'enviado':
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20"><Send className="size-3 mr-1" /> Enviado</Badge>;
      case 'cancelado':
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/20"><XCircle className="size-3 mr-1" /> Cancelado</Badge>;
      default:
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20"><Clock className="size-3 mr-1" /> Rascunho</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Total de Contratos</span>
            <FileText className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">{metrics.total}</div>
          <p className="text-xs text-muted-foreground mt-1">{metrics.signedCount} ativos / assinados</p>
        </div>

        <div className="p-4 rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Faturamento Setup (Assinados)</span>
            <DollarSign className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">{formatBRL(metrics.totalSetup)}</div>
          <p className="text-xs text-muted-foreground mt-1">Total em implantações</p>
        </div>

        <div className="p-4 rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">MRR Recorrente Ativo</span>
            <TrendingUp className="size-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{formatBRL(metrics.mrr)}<span className="text-xs font-normal text-muted-foreground">/mês</span></div>
          <p className="text-xs text-muted-foreground mt-1">Hospedagem & Manutenção</p>
        </div>

        <div className="p-4 rounded-xl border border-border/50 bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Taxa de Conversão</span>
            <CheckCircle2 className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {metrics.total > 0 ? `${Math.round((metrics.signedCount / metrics.total) * 100)}%` : '0%'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Contratos fechados</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, empresa ou contrato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs bg-muted border-border"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'assinado', 'enviado', 'rascunho', 'cancelado'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {st === 'all' ? 'Todos' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Contracts Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : filteredContracts.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/60 rounded-xl bg-muted/10">
          <FileText className="size-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">Nenhum contrato encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">
            Abra a ficha de qualquer contato em &quot;Contatos&quot; e use a aba &quot;Contratos&quot; para cadastrar
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground border-b border-border/50 uppercase font-medium">
                <tr>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Contrato</th>
                  <th className="py-3 px-4">Modalidade</th>
                  <th className="py-3 px-4">Valores</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredContracts.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">{c.contact?.name || 'Cliente'}</div>
                      {c.contact?.company && (
                        <div className="text-[11px] text-muted-foreground">{c.contact.company}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-foreground">{c.title}</td>
                    <td className="py-3 px-4">
                      {c.type === 'recorrente' ? (
                        <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
                          Recorrência
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Projeto Fechado
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">Setup: {formatBRL(c.setup_price)}</div>
                      {c.type === 'recorrente' && (
                        <div className="text-[11px] text-emerald-400">
                          {formatBRL(c.monthly_price)}/mês (dia {c.billing_day || 10})
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(c.status)}
                        <select
                          value={c.status}
                          onChange={(e) => handleStatusChange(c.id, e.target.value as ContractStatus)}
                          className="text-[10px] bg-muted border border-border/50 rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <option value="rascunho">Rascunho</option>
                          <option value="enviado">Enviado</option>
                          <option value="assinado">Assinado</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Copiar minuta"
                          onClick={() => handleCopyDraft(c)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        {c.document_url && (
                          <a href={c.document_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="size-7" title="Abrir link do documento">
                              <ExternalLink className="size-3.5" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          title="Excluir"
                          onClick={() => handleDelete(c.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
