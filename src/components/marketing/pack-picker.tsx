'use client';

import { CheckCircle2, Film, Images, Scissors, Smartphone, Square, Tag } from 'lucide-react';
import type { Pack } from '@/lib/marketing/packs/types';
import { MARKETING_TEMPLATES, type TemplateFieldValues } from '@/lib/marketing/templates';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const BUTTON_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  compilado: Scissors,
  'antes-depois': Images,
  oferta: Tag,
};

export type ReelsFormat = 'vertical' | 'square';

const FORMAT_CHOICES: { value: ReelsFormat; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'vertical', label: 'Vertical (9:16)', icon: Smartphone },
  { value: 'square', label: 'Quadrado (1:1)', icon: Square },
];

interface PackPickerProps {
  pack: Pack;
  buttonId: string;
  onButtonChange: (id: string) => void;
  fieldValues: TemplateFieldValues;
  onFieldChange: (fieldId: string, value: string) => void;
  formats: ReelsFormat[];
  onFormatsChange: (formats: ReelsFormat[]) => void;
  disabled?: boolean;
}

// O dono só escolhe um botão do nicho dele, preenche poucos campos e marca os
// formatos. Roteiro, ritmo e legenda ficam por conta do sistema.
export function PackPicker({
  pack, buttonId, onButtonChange, fieldValues, onFieldChange, formats, onFormatsChange, disabled = false,
}: PackPickerProps) {
  const current = pack.buttons.find((b) => b.id === buttonId) ?? pack.buttons[0];
  const form = MARKETING_TEMPLATES.find((t) => t.id === current.formId);

  function toggle(format: ReelsFormat) {
    onFormatsChange(formats.includes(format) ? formats.filter((f) => f !== format) : [...formats, format]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Que vídeo você quer fazer?</h2>
        <p className="text-xs text-muted-foreground">Vídeo para Instagram e TikTok. Escolha um e preencha o que pedir.</p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {pack.buttons.map((b) => {
          const Icon = BUTTON_ICONS[b.id] ?? Film;
          const selected = current.id === b.id;
          return (
            <button
              key={b.id}
              type="button"
              disabled={disabled}
              onClick={() => onButtonChange(b.id)}
              className={`group relative flex flex-col rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer ${
                selected
                  ? 'border-[#0624C7] bg-[#0624C7]/5 ring-1 ring-[#0624C7]/40 shadow-xs'
                  : 'border-border/70 bg-card hover:border-border hover:bg-muted/30'
              }`}
            >
              <div className="mb-2 flex w-full items-center justify-between">
                <div className={`flex size-8 items-center justify-center rounded-lg ${selected ? 'bg-[#0624C7] text-white' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="size-4" />
                </div>
                {selected && <CheckCircle2 className="size-4 text-[#0624C7] dark:text-blue-400" />}
              </div>
              <h3 className="text-sm font-semibold text-foreground">{b.label}</h3>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{b.description}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/80 bg-background/80 p-4 shadow-xs sm:grid-cols-2">
        {(form?.fields ?? []).map((field) => (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={`pack-field-${field.id}`} className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>{field.label}</span>
              {field.required && <span className="text-[10px] font-normal text-muted-foreground">(obrigatório)</span>}
            </Label>
            <Input
              id={`pack-field-${field.id}`}
              type="text"
              maxLength={200}
              value={fieldValues[field.id] ?? ''}
              onChange={(e) => onFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              className="h-9 border-border/70 bg-card text-xs focus:border-[#0624C7]"
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <span className="text-xs font-medium text-foreground">Formatos (pode marcar os dois):</span>
        <div className="grid grid-cols-2 gap-1.5 sm:max-w-md">
          {FORMAT_CHOICES.map(({ value, label, icon: Icon }) => {
            const on = formats.includes(value);
            return (
              <button
                key={value}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={() => toggle(value)}
                className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs transition-all cursor-pointer ${
                  on
                    ? 'border-primary bg-primary/10 font-medium text-primary shadow-xs'
                    : 'border-border/70 bg-background/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
