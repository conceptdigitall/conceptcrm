'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Contact } from '@/types';
import type { ContractFormData, ContractStatus, ContractType } from '@/types/contracts';

interface ContractFormDialogProps {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onSave: (form: ContractFormData) => Promise<void>;
}

export function ContractFormDialog({
  open,
  contact,
  onClose,
  onSave,
}: ContractFormDialogProps) {
  const [title, setTitle] = useState('Contrato de Prestação de Serviços Digitais');
  const [type, setType] = useState<ContractType>('avulso');
  const [status, setStatus] = useState<ContractStatus>('rascunho');
  const [setupPrice, setSetupPrice] = useState('1500');
  const [monthlyPrice, setMonthlyPrice] = useState('0');
  const [billingDay, setBillingDay] = useState('10');
  const [documentUrl, setDocumentUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title: title.trim() || 'Contrato Digital',
        type,
        status,
        setup_price: parseFloat(setupPrice) || 0,
        monthly_price: type === 'recorrente' ? parseFloat(monthlyPrice) || 0 : 0,
        billing_day: type === 'recorrente' ? parseInt(billingDay, 10) || 10 : null,
        document_url: documentUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-popover border border-border rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <h3 className="text-sm font-semibold text-foreground">Novo Contrato com {contact?.name || 'Cliente'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <Label className="text-xs">Título do Contrato</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required className="h-8 text-xs bg-muted" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Modalidade</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ContractType)}
                className="w-full h-8 text-xs bg-muted border border-border rounded-md px-2 text-foreground"
              >
                <option value="avulso">Projeto Fechado</option>
                <option value="recorrente">Setup + Mensalidade</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status Inicial</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ContractStatus)}
                className="w-full h-8 text-xs bg-muted border border-border rounded-md px-2 text-foreground"
              >
                <option value="rascunho">Rascunho</option>
                <option value="enviado">Enviado</option>
                <option value="assinado">Assinado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Valor do Setup (R$)</Label>
              <Input type="number" step="0.01" value={setupPrice} onChange={(e) => setSetupPrice(e.target.value)} required className="h-8 text-xs bg-muted" />
            </div>
            {type === 'recorrente' ? (
              <div className="space-y-1">
                <Label className="text-xs">Mensalidade (R$/mês)</Label>
                <Input type="number" step="0.01" value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} required className="h-8 text-xs bg-muted" />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Garantia Técnica</Label>
                <Input disabled value="30 dias inclusos" className="h-8 text-xs bg-muted/50 text-muted-foreground" />
              </div>
            )}
          </div>

          {type === 'recorrente' && (
            <div className="space-y-1">
              <Label className="text-xs">Dia do Vencimento da Mensalidade (1 a 31)</Label>
              <Input type="number" min="1" max="31" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} className="h-8 text-xs bg-muted" />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Link da Assinatura / PDF (ZapSign, Clicksign ou Drive)</Label>
            <Input placeholder="https://app.zapsign.com.br/doc/..." value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} className="h-8 text-xs bg-muted" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notas de Escopo / Observações</Label>
            <Textarea rows={3} placeholder="Ex: Criação da vitrine country, 9 produtos cadastrados, fotos de estúdio tratadas..." value={notes} onChange={(e) => setNotes(e.target.value)} className="text-xs bg-muted resize-none" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">Cancelar</Button>
            <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground text-xs">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : 'Salvar Contrato'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
