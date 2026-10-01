'use client';

import {
  Tag,
  Sparkles,
  MapPin,
  MessageSquareQuote,
  LayoutGrid,
  FileEdit,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import {
  MARKETING_TEMPLATES,
  type MarketingTemplateId,
  type TemplateFieldValues,
} from '@/lib/marketing/templates';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const TEMPLATE_ICONS: Record<MarketingTemplateId, React.ComponentType<{ className?: string }>> = {
  discount: Tag,
  highlight: Sparkles,
  institutional: MapPin,
  testimonial: MessageSquareQuote,
};

interface TemplatePickerProps {
  mode: 'templates' | 'custom';
  onModeChange: (mode: 'templates' | 'custom') => void;
  selectedTemplateId: MarketingTemplateId;
  onTemplateChange: (id: MarketingTemplateId) => void;
  fieldValues: TemplateFieldValues;
  onFieldChange: (fieldId: string, value: string) => void;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
  disabled?: boolean;
}

export function TemplatePicker({
  mode,
  onModeChange,
  selectedTemplateId,
  onTemplateChange,
  fieldValues,
  onFieldChange,
  customPrompt,
  onCustomPromptChange,
  disabled = false,
}: TemplatePickerProps) {
  const currentTemplate =
    MARKETING_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? MARKETING_TEMPLATES[0];

  return (
    <div className="space-y-4">
      {/* Seletor de Modo: Modelos Prontos vs Texto Livre */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-xl border border-border/80 bg-muted/40 p-1 text-xs">
          <button
            type="button"
            onClick={() => onModeChange('templates')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all duration-200 cursor-pointer ${
              mode === 'templates'
                ? 'bg-background text-[#0624C7] dark:text-blue-400 shadow-xs border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="size-3.5" />
            <span>Modelos Prontos (Fácil)</span>
          </button>

          <button
            type="button"
            onClick={() => onModeChange('custom')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all duration-200 cursor-pointer ${
              mode === 'custom'
                ? 'bg-background text-[#0624C7] dark:text-blue-400 shadow-xs border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileEdit className="size-3.5" />
            <span>Texto Livre / Avançado</span>
          </button>
        </div>

        <span className="text-[11px] text-muted-foreground hidden sm:inline-flex items-center gap-1">
          <HelpCircle className="size-3" />
          {mode === 'templates'
            ? 'A IA gera o roteiro perfeito a partir dos campos'
            : 'Escreva seu briefing personalizado'}
        </span>
      </div>

      {/* MODO 1: MODELOS PRONTOS */}
      {mode === 'templates' ? (
        <div className="space-y-4">
          {/* Grid dos 4 Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {MARKETING_TEMPLATES.map((tpl) => {
              const Icon = TEMPLATE_ICONS[tpl.id];
              const isSelected = selectedTemplateId === tpl.id;

              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onTemplateChange(tpl.id)}
                  disabled={disabled}
                  className={`group relative flex flex-col text-left rounded-xl border p-3 transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'border-[#0624C7] bg-[#0624C7]/5 ring-1 ring-[#0624C7]/40 shadow-xs'
                      : 'border-border/70 bg-card hover:border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <div
                      className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-[#0624C7] text-white'
                          : 'bg-muted text-muted-foreground group-hover:text-foreground'
                      }`}
                    >
                      <Icon className="size-3.5" />
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="size-4 text-[#0624C7] dark:text-blue-400" />
                    )}
                  </div>

                  <h4 className="text-xs font-semibold text-foreground line-clamp-1">
                    {tpl.title}
                  </h4>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                    {tpl.tagline}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Área de Campos Guiados do Template Selecionado */}
          <div className="rounded-xl border border-border/80 bg-background/80 p-4 space-y-3.5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-border/40 pb-2.5">
              <div>
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <span className="flex size-1.5 rounded-full bg-[#0624C7]" />
                  Preencha os dados do modelo: {currentTemplate.title}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {currentTemplate.description}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentTemplate.fields.map((field) => {
                const val = fieldValues[field.id] ?? '';
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label
                      htmlFor={`tpl-field-${field.id}`}
                      className="text-xs font-medium text-foreground flex items-center justify-between"
                    >
                      <span>{field.label}</span>
                      {field.required && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          (obrigatório)
                        </span>
                      )}
                    </Label>
                    <Input
                      id={`tpl-field-${field.id}`}
                      type="text"
                      value={val}
                      onChange={(e) => onFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      disabled={disabled}
                      className="h-9 text-xs bg-card border-border/70 focus:border-[#0624C7]"
                    />
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1">
              <Sparkles className="size-3 text-[#FCE026]" />
              <span>A IA cria o gancho, roteiro e ritmo profissional a partir das informações acima.</span>
            </p>
          </div>
        </div>
      ) : (
        /* MODO 2: TEXTO LIVRE / AVANÇADO */
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <Label htmlFor="video-prompt" className="font-medium text-foreground">
              Briefing e copy personalizada do vídeo:
            </Label>
            <span className="font-mono text-muted-foreground">{customPrompt.length}/1000</span>
          </div>
          <textarea
            id="video-prompt"
            className="min-h-24 w-full rounded-xl border border-border/80 bg-background/80 p-3 text-xs sm:text-sm transition-all placeholder:text-muted-foreground/60 focus:border-[#0624C7] focus:ring-1 focus:ring-[#0624C7] focus:outline-none"
            placeholder="Descreva a oferta ou o objetivo do vídeo. Ex: Promoção de corte + barba por R$ 50 nesta sexta na Barbearia do Alemão, Santos. Vagas limitadas no WhatsApp."
            value={customPrompt}
            maxLength={1000}
            disabled={disabled}
            onChange={(e) => onCustomPromptChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
