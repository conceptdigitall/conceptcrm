'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Gera um lembrete para o lead que parou de responder (Humanizer, nunca
 * igual aos anteriores). O João revisa, edita se quiser e só então envia.
 */
export function FollowUpDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
  onSent,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const [text, setText] = useState('');
  const [daysWaiting, setDaysWaiting] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Falha ao gerar a mensagem');
      setText(data.text || '');
      setDaysWaiting(typeof data.daysWaiting === 'number' ? data.daysWaiting : null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [contactId]);

  useEffect(() => {
    if (open) {
      setText('');
      generate();
    }
  }, [open, generate]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', text: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Falha ao enviar');
      toast.success(`Follow-up enviado para ${contactName}`);
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Follow-up para {contactName}</DialogTitle>
          <DialogDescription>
            {daysWaiting != null
              ? `Sem resposta há ${daysWaiting} ${daysWaiting === 1 ? 'dia' : 'dias'}. `
              : ''}
            Cada mensagem é escrita do zero e diferente das anteriores. Revise antes de enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder={generating ? 'Escrevendo…' : 'A mensagem aparece aqui'}
            disabled={generating}
            className="resize-none"
          />
          {generating && (
            <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={generate} disabled={generating || sending}>
            <RefreshCw className="size-4" />
            Gerar outra
          </Button>
          <Button onClick={send} disabled={!text.trim() || generating || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar no WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
