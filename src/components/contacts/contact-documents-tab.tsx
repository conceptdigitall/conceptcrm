'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Copy,
  ExternalLink,
  Trash2,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  Loader2,
  DollarSign,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Contact } from '@/types';
import type { ClientContract, ContractFormData, ContractStatus } from '@/types/contracts';
import {
  fetchContactContracts,
  createContract,
  updateContract,
  deleteContract,
} from '@/lib/contracts/api';
import { generateContractDraft, formatBRL } from '@/lib/contracts/minuta-generator';
import { ContractFormDialog } from '@/components/contacts/contract-form-dialog';

interface ContactDocumentsTabProps {
  contact: Contact | null;
  accountId: string;
}

export function ContactDocumentsTab({ contact, accountId }: ContactDocumentsTabProps) {
  const supabase = createClient();
  const [contracts, setContracts] = useState<ClientContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const loadContracts = useCallback(async () => {
    if (!contact?.id || !accountId) return;
    setLoading(true);
    try {
      const data = await fetchContactContracts(supabase, contact.id, accountId);
      setContracts(data);
    } catch {
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  }, [contact?.id, accountId, supabase]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  const handleSave = async (form: ContractFormData) => {
    if (!contact?.id || !accountId) return;
    try {
      await createContract(supabase, {
        accountId,
        contactId: contact.id,
        form,
      });

      toast.success('Contrato registrado com sucesso!');
      loadContracts();
    } catch {
      toast.error('Erro ao salvar contrato');
      throw new Error('Save failed');
    }
  };

  const handleCopyDraft = (contract: ClientContract) => {
    if (!contact) return;
    const text = generateContractDraft(
      {
        name: contact.name,
        company: contact.company,
        phone: contact.phone,
        email: contact.email,
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
    toast.success('Minuta copiada para a área de transferência!');
  };

  const handleQuickStatusChange = async (id: string, newStatus: ContractStatus) => {
    try {
      await updateContract(supabase, id, { status: newStatus });
      toast.success(`Status atualizado para ${newStatus}`);
      loadContracts();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este contrato permanentemente?')) return;
    try {
      await deleteContract(supabase, id);
      toast.success('Contrato removido');
      loadContracts();
    } catch {
      toast.error('Erro ao remover contrato');
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
    <div className="space-y-4 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">Documentos & Contratos</h4>
          <p className="text-xs text-muted-foreground">Formalizações e acordos vinculados a este cliente</p>
        </div>
        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 gap-1.5 text-xs"
        >
          <Plus className="size-3.5" /> Novo Contrato
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border/60 rounded-xl bg-muted/20">
          <FileText className="size-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-xs font-medium text-foreground">Nenhum contrato cadastrado</p>
          <p className="text-xs text-muted-foreground mt-0.5">Clique em &quot;Novo Contrato&quot; para registrar uma proposta ou minuta</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {contracts.map((c) => (
            <div key={c.id} className="p-3 rounded-lg border border-border/50 bg-card hover:border-border transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground truncate">{c.title}</span>
                    {getStatusBadge(c.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <DollarSign className="size-3 text-primary" />
                      Setup: {formatBRL(c.setup_price)}
                    </span>
                    {c.type === 'recorrente' ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <Calendar className="size-3" />
                        {formatBRL(c.monthly_price)}/mês (dia {c.billing_day || 10})
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Projeto Fechado</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:bg-muted"
                    title="Copiar minuta para ZapSign / Docs"
                    onClick={() => handleCopyDraft(c)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  {c.document_url && (
                    <a href={c.document_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="size-7 hover:bg-muted" title="Abrir link do documento">
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
              </div>

              {c.notes && (
                <p className="mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/30 line-clamp-2">
                  {c.notes}
                </p>
              )}

              {/* Status switcher pills */}
              <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground">Mudar status:</span>
                {(['rascunho', 'enviado', 'assinado', 'cancelado'] as ContractStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleQuickStatusChange(c.id, st)}
                    disabled={c.status === st}
                    className={`text-[10px] px-1.5 py-0.5 rounded capitalize transition-colors ${
                      c.status === st ? 'bg-primary/20 text-primary font-medium cursor-default' : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ContractFormDialog
        open={modalOpen}
        contact={contact}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
