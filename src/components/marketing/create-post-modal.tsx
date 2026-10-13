'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, Check, Film, Layers, Loader2, Sparkles, ArrowLeft } from 'lucide-react';
import type { MarketingPost, MarketingSettings, PostKind, PostMediaType } from '@/types';
import { IDEA_PRESETS, buildCaption, buildCaptionOptions } from '@/lib/marketing/content';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CreatePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: MarketingSettings;
  onCreated: (post: MarketingPost) => void;
  defaultKind?: PostKind;
}

const MEDIA_TYPES: { type: PostMediaType; label: string; hint: string; icon: typeof Camera }[] = [
  { type: 'foto', label: 'Foto', hint: '1 imagem com texto e legenda estratégica', icon: Camera },
  { type: 'carrossel', label: 'Carrossel', hint: 'Até 10 telas em sequência educativa', icon: Layers },
  { type: 'video', label: 'Vídeo (Reel)', hint: 'Com narração, ritmo dinâmico e trilha sonora', icon: Film },
];

const FIELD =
  'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

export function CreatePostModal({
  open,
  onOpenChange,
  settings,
  onCreated,
  defaultKind = 'feed',
}: CreatePostModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mediaType, setMediaType] = useState<PostMediaType>('foto');
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [options, setOptions] = useState<string[]>([]);

  function handleSelectType(type: PostMediaType) {
    setMediaType(type);
    setStep(2);
  }

  async function generateCaptions(source: string) {
    const base = source.trim();
    if (!base) {
      toast.info('Escreva a ideia ou toque numa ideia pronta');
      return;
    }
    if (!title.trim()) setTitle(base.slice(0, 40));
    setGenerating(true);
    try {
      const res = await fetch('/api/marketing/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: base }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.options)) throw new Error(data?.error || 'Falha ao gerar legenda');
      setOptions(data.options);
      setCaption(data.options[0] ?? '');
    } catch {
      // Sem rede ou rota fora: as variações locais garantem que o botão sempre responde.
      const local = buildCaptionOptions(settings, base);
      setOptions(local);
      setCaption(local[0]);
    } finally {
      setGenerating(false);
    }
  }

  function handlePreset(presetIdea: string, label: string) {
    setIdea(presetIdea);
    void generateCaptions(presetIdea);
    // Depois de generateCaptions, que só preenche o título quando ele está vazio.
    setTitle(label);
  }

  function reset() {
    setStep(1);
    setTitle('');
    setIdea('');
    setCaption('');
    setMediaUrl('');
    setOptions([]);
  }

  async function handleSave(status: 'draft' | 'pending_approval') {
    if (!title.trim() && !idea.trim()) return;
    setSaving(true);
    try {
      const finalTitle = title.trim() || idea.trim().slice(0, 40);
      const finalCaption = caption.trim() || buildCaption(settings, idea.trim());
      const urls = mediaUrl.trim()
        ? [mediaUrl.trim()]
        : ['https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1080&auto=format&fit=crop'];

      const res = await fetch('/api/marketing/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: defaultKind,
          media_type: mediaType,
          title: finalTitle,
          idea: idea.trim(),
          caption: finalCaption,
          media_urls: urls,
          status,
        }),
      });

      if (!res.ok) throw new Error('Falha ao salvar post');
      const data = await res.json();
      onCreated(data.post);
      toast.success(status === 'draft' ? 'Rascunho salvo' : 'Enviado para aprovação');
      onOpenChange(false);
      reset();
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível salvar o post. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving && Boolean(title.trim() || idea.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] max-w-[calc(100%-1.5rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto overflow-x-hidden bg-card border-border text-foreground p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="flex flex-row items-center justify-between pb-1">
          <div className="flex items-center gap-1">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="Voltar"
                className="flex h-11 w-11 -ml-3 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <DialogTitle className="text-lg font-bold">
              {step === 1
                ? defaultKind === 'story' ? 'O que vamos postar no story?' : 'O que vamos postar?'
                : 'Ideia e legenda'}
            </DialogTitle>
          </div>
        </DialogHeader>

        {step === 1 ? (
          <div className="flex flex-col gap-3 py-1">
            {MEDIA_TYPES.map(({ type, label, hint, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleSelectType(type)}
                className="flex items-center gap-4 min-h-16 p-4 rounded-xl border border-border bg-background hover:border-primary hover:bg-primary-soft active:scale-[0.98] transition text-left group"
              >
                <div className="p-2.5 rounded-lg bg-primary-soft text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Ideias prontas: toque e a legenda sai na hora</span>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {IDEA_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    disabled={generating}
                    onClick={() => handlePreset(p.idea, p.label)}
                    className={`flex-none h-9 px-3 rounded-full border text-xs font-medium transition-colors disabled:opacity-50 ${
                      idea === p.idea
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="mkt-idea" className="text-xs font-medium text-muted-foreground">Qual é a ideia principal?</label>
              <textarea
                id="mkt-idea"
                rows={2}
                placeholder="Ex: Como pequenos negócios perdem vendas por demorar mais de 10 min para responder..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className={`${FIELD} resize-none`}
              />
              <Button
                type="button"
                onClick={() => generateCaptions(idea || title)}
                disabled={generating}
                variant="outline"
                className="h-11 rounded-xl gap-2 border-primary/40 text-primary hover:bg-primary-soft"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Gerando legendas...' : options.length ? 'Gerar outras 3 legendas' : 'Gerar 3 legendas com IA'}
              </Button>
            </div>

            {options.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">Escolha uma legenda (dá para editar depois)</span>
                {options.map((opt, i) => {
                  const chosen = caption === opt;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCaption(opt)}
                      className={`relative text-left p-3 pr-9 rounded-xl border text-xs leading-relaxed whitespace-pre-wrap transition-colors ${
                        chosen ? 'border-primary bg-primary-soft text-foreground' : 'border-border bg-background text-foreground/80 hover:border-primary/40'
                      }`}
                    >
                      <span className="line-clamp-4">{opt}</span>
                      {chosen && <Check className="absolute top-3 right-3 w-4 h-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="mkt-caption" className="text-xs font-medium text-muted-foreground">Legenda final e hashtags</label>
              <textarea
                id="mkt-caption"
                rows={4}
                placeholder="Gere acima ou escreva a legenda completa que irá para o Instagram..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className={`${FIELD} resize-y`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="mkt-title" className="text-xs font-medium text-muted-foreground">Título do post na grade</label>
              <input
                id="mkt-title"
                type="text"
                placeholder="Ex: 3 erros no WhatsApp da sua empresa"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={FIELD}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="mkt-media" className="text-xs font-medium text-muted-foreground">URL da imagem / mídia (opcional)</label>
              <input
                id="mkt-media"
                type="url"
                inputMode="url"
                placeholder="https://... (ou deixe vazio para arte automática)"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                className={FIELD}
              />
            </div>

            <div className="flex gap-2 sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 bg-card border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSave('draft')}
                disabled={!canSave}
                className="flex-1 h-12 rounded-xl"
              >
                Salvar rascunho
              </Button>
              <Button
                type="button"
                onClick={() => handleSave('pending_approval')}
                disabled={!canSave}
                className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pedir aprovação'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
