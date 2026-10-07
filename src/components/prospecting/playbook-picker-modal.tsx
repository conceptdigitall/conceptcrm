'use client';

import React, { useState, useMemo } from 'react';
import {
  MessageCircle,
  Copy,
  CheckCircle2,
  LayoutGrid,
  FileEdit,
  Sparkles,
  Phone,
  User,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { NicheKey, getNicheConfig } from '@/config/niches';
import {
  getPlaybooksByNiche,
  generatePlaybookCopy,
  generateWhatsAppLink,
  PlaybookTemplate,
} from '@/lib/prospecting/playbooks';

export interface PlaybookContact {
  id: string;
  name: string;
  phone: string;
  service?: string;
}

export interface PlaybookPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: PlaybookContact | null;
  niche: NicheKey;
  onMarkContacted?: (contactId: string, message: string) => void;
}

interface InnerContentProps {
  contact: PlaybookContact;
  niche: NicheKey;
  onClose: () => void;
  onMarkContacted?: (contactId: string, message: string) => void;
}

function PlaybookPickerContent({
  contact,
  niche,
  onClose,
  onMarkContacted,
}: InnerContentProps) {
  const nicheConfig = useMemo(() => getNicheConfig(niche), [niche]);
  const templates = useMemo(() => getPlaybooksByNiche(niche), [niche]);

  const [mode, setMode] = useState<'templates' | 'custom'>('templates');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => templates[0]?.id ?? '');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { Nome: contact.name, Servico: contact.service ?? '' };
    templates[0]?.fields.forEach((f) => {
      if (f.defaultValue && !init[f.key]) init[f.key] = f.defaultValue;
    });
    return init;
  });

  const [customText, setCustomText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const currentTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) ?? templates[0];
  }, [templates, selectedTemplateId]);

  const handleSelectTemplate = (template: PlaybookTemplate) => {
    setSelectedTemplateId(template.id);
    const updated: Record<string, string> = {
      ...fieldValues,
      Nome: contact.name,
      Servico: contact.service ?? '',
    };
    template.fields.forEach((f) => {
      if (!updated[f.key] && f.defaultValue) updated[f.key] = f.defaultValue;
    });
    setFieldValues(updated);
  };

  const handleFieldChange = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const generatedCopy = useMemo(() => {
    if (mode === 'custom') return customText;
    if (!currentTemplate) return '';
    return generatePlaybookCopy(currentTemplate.id, fieldValues, niche);
  }, [mode, customText, currentTemplate, fieldValues, niche]);

  const handleCopy = async () => {
    if (!generatedCopy) return;
    try {
      await navigator.clipboard.writeText(generatedCopy);
    } catch {
      // Fallback
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    if (!contact.phone || !generatedCopy) return;
    const link = generateWhatsAppLink(contact.phone, generatedCopy);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const handleConfirmContacted = () => {
    onMarkContacted?.(contact.id, generatedCopy);
    onClose();
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-2xl p-6">
      <DialogHeader className="space-y-1.5 pb-2 border-b border-border/60">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs bg-muted/40 font-medium">
            {nicheConfig.badge}
          </Badge>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="size-3.5" />
            <span className="font-medium text-foreground">{contact.name}</span>
            <span>•</span>
            <Phone className="size-3.5" />
            <span>{contact.phone}</span>
          </div>
        </div>
        <DialogTitle className="text-xl font-bold tracking-tight">
          Playbook de Abordagem Guiada
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Escolha um modelo estratégico validado para o nicho de {nicheConfig.label} ou customize livremente.
        </DialogDescription>
      </DialogHeader>

      {/* Seletor de Modo */}
      <div className="flex items-center justify-between pt-2">
        <div className="inline-flex rounded-xl border border-border/80 bg-muted/40 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('templates')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all cursor-pointer ${
              mode === 'templates'
                ? 'bg-background text-[#0624C7] dark:text-blue-400 shadow-xs border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="size-3.5" />
            <span>Modelos Guiados</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('custom');
              if (!customText && generatedCopy) setCustomText(generatedCopy);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all cursor-pointer ${
              mode === 'custom'
                ? 'bg-background text-[#0624C7] dark:text-blue-400 shadow-xs border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileEdit className="size-3.5" />
            <span>Texto Livre</span>
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground hidden sm:inline-flex items-center gap-1">
          <Sparkles className="size-3 text-[#0624C7] dark:text-blue-400" />
          Tom: {nicheConfig.tone}
        </span>
      </div>

      {/* Conteúdo do Modo: Modelos Guiados */}
      {mode === 'templates' ? (
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#0624C7] bg-[#0624C7]/5 dark:border-blue-400 dark:bg-blue-400/10 ring-1 ring-[#0624C7]/20'
                      : 'border-border/80 hover:border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {tpl.category}
                    </span>
                    {isSelected && <CheckCircle2 className="size-3.5 text-[#0624C7] dark:text-blue-400" />}
                  </div>
                  <span className="text-xs font-semibold text-foreground line-clamp-1">
                    {tpl.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                    {tpl.description}
                  </span>
                </button>
              );
            })}
          </div>

          {currentTemplate && currentTemplate.fields.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <span className="text-xs font-semibold text-foreground block">
                Campos de Personalização
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {currentTemplate.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      value={fieldValues[f.key] ?? ''}
                      onChange={(e) => handleFieldChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 pt-1">
          <Label className="text-xs font-medium text-muted-foreground">
            Mensagem personalizada para o contato
          </Label>
          <Textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Digite sua mensagem direta..."
            className="min-h-[140px] text-xs leading-relaxed resize-none"
          />
        </div>
      )}

      {/* Prévia da Mensagem */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <MessageCircle className="size-3.5 text-[#0624C7] dark:text-blue-400" />
            Prévia da Mensagem (WhatsApp)
          </span>
          <span className="text-[11px] text-muted-foreground">
            {generatedCopy.length} caracteres
          </span>
        </div>
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 text-xs text-foreground/90 leading-relaxed font-sans whitespace-pre-wrap select-text">
          {generatedCopy || <span className="text-muted-foreground italic">Preencha os campos para ver a prévia...</span>}
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-border/60">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="w-full sm:w-auto h-9 text-xs gap-1.5 cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-600" />
              <span className="text-emerald-600 font-medium">Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>Copiar Mensagem</span>
            </>
          )}
        </Button>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {onMarkContacted && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleConfirmContacted}
              className="flex-1 sm:flex-none h-9 text-xs gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="size-3.5 text-muted-foreground" />
              <span>Marcar Contatado</span>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={handleOpenWhatsApp}
            className="flex-1 sm:flex-none h-9 text-xs gap-1.5 bg-[#0624C7] hover:bg-[#051db0] text-white cursor-pointer shadow-xs"
          >
            <MessageCircle className="size-3.5" />
            <span>Abrir no WhatsApp</span>
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function PlaybookPickerModal(props: PlaybookPickerModalProps) {
  if (!props.contact) return null;

  return (
    <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <PlaybookPickerContent
        key={props.contact.id}
        contact={props.contact}
        niche={props.niche}
        onClose={props.onClose}
        onMarkContacted={props.onMarkContacted}
      />
    </Dialog>
  );
}
