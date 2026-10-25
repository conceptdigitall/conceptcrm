'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, LayoutGrid, Loader2, MessageCircle, Mic, MicOff, Send, Smartphone, Sparkles } from 'lucide-react';
import type { MarketingPost, MarketingSettings } from '@/types';
import { Button } from '@/components/ui/button';

interface QuickCreatorBarProps {
  settings: MarketingSettings;
  onPostsCreated: (newPosts: MarketingPost[]) => void;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function QuickCreatorBar({ settings, onPostsCreated }: QuickCreatorBarProps) {
  const [quickText, setQuickText] = useState('');
  const [quickKind, setQuickKind] = useState<'story' | 'feed'>('story');
  const [mediaUrl, setMediaUrl] = useState('');
  const [showPhotoField, setShowPhotoField] = useState(false);
  const [recording, setRecording] = useState(false);
  const [generatingDaily, setGeneratingDaily] = useState(false);
  const [creatingQuick, setCreatingQuick] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  function toggleVoiceRecording() {
    if (recording && recognitionRef.current) {
      recognitionRef.current.stop();
      setRecording(false);
      return;
    }

    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
    const SpeechRec = (win.SpeechRecognition || win.webkitSpeechRecognition) as (new () => SpeechRecognitionInstance) | undefined;

    if (!SpeechRec) {
      toast.info('Seu navegador não suporta ditado por voz direto. Digite sua ideia no campo ao lado!');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setQuickText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          toast.success('Áudio transcrito! Revise ou clique em Criar.');
        }
      };
      rec.onerror = () => {
        setRecording(false);
        toast.error('Não foi possível captar o microfone. Verifique a permissão.');
      };
      rec.onend = () => setRecording(false);
      recognitionRef.current = rec;
      setRecording(true);
      rec.start();
    } catch {
      setRecording(false);
    }
  }

  async function handleGenerateDaily() {
    setGeneratingDaily(true);
    try {
      const res = await fetch('/api/marketing/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_daily' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar pauta');
      const created: MarketingPost[] = data.posts || [];
      onPostsCreated(created);
      toast.success(
        settings.require_approval
          ? `Pauta de hoje criada (${created.length} itens)! Confira abaixo para aprovar.`
          : `Pauta de hoje criada e agendada no Piloto Automático (${created.length} itens)!`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar pauta do dia');
    } finally {
      setGeneratingDaily(false);
    }
  }

  async function handleQuickCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!quickText.trim()) {
      toast.warning('Fale no microfone ou escreva em 1 frase o que deseja postar.');
      return;
    }
    setCreatingQuick(true);
    try {
      const res = await fetch('/api/marketing/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quick_input',
          text: quickText.trim(),
          kind: quickKind,
          mediaUrl: mediaUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar postagem rápida');
      if (data.post) {
        onPostsCreated([data.post as MarketingPost]);
      }
      setQuickText('');
      setMediaUrl('');
      setShowPhotoField(false);
      toast.success(
        quickKind === 'story'
          ? 'Story criado a partir do seu comando!'
          : 'Post de Feed criado a partir do seu comando!',
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar postagem');
    } finally {
      setCreatingQuick(false);
    }
  }

  async function handleNotifyWhatsApp() {
    setSendingWhatsApp(true);
    try {
      const res = await fetch('/api/marketing/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify_whatsapp' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao preparar resumo');
      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, '_blank', 'noopener,noreferrer');
        toast.success('Abrindo resumo no seu WhatsApp!');
      } else {
        await navigator.clipboard?.writeText(data.whatsappMessage || '');
        toast.success('Resumo copiado! Configure seu número na aba Ajustes para abrir direto no WhatsApp.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar para WhatsApp');
    } finally {
      setSendingWhatsApp(false);
    }
  }

  const isStory = quickKind === 'story';

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5 flex flex-col gap-3">
      {/* Uma pergunta, uma ação principal (Lei de Hick). O resto fica discreto embaixo. */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm md:text-base font-heading font-semibold text-foreground">
          O que vamos postar hoje?
        </h2>
        <div role="radiogroup" aria-label="Formato" className="flex rounded-full border border-border bg-background p-0.5 shrink-0">
          {(['story', 'feed'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={quickKind === k}
              onClick={() => setQuickKind(k)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold transition-colors ${
                quickKind === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {k === 'story' ? <Smartphone className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
              {k === 'story' ? 'Story' : 'Post'}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleQuickCreate} className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-background p-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <button
            type="button"
            onClick={toggleVoiceRecording}
            aria-label={recording ? 'Parar gravação' : 'Falar pelo microfone'}
            aria-pressed={recording}
            className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition-colors ${
              recording ? 'bg-destructive/15 text-destructive animate-pulse' : 'text-primary hover:bg-muted'
            }`}
          >
            {recording ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
          </button>

          <input
            type="text"
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder={recording ? 'Ouvindo… pode falar' : isStory ? 'Ex: promoção de hoje, corte + barba por R$ 65' : 'Ex: 3 dicas para manter a barba alinhada'}
            aria-label="Ideia do conteúdo"
            className="min-w-0 flex-1 h-10 bg-transparent px-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          <button
            type="button"
            onClick={() => setShowPhotoField((v) => !v)}
            aria-label="Anexar foto"
            aria-pressed={showPhotoField || Boolean(mediaUrl)}
            className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition-colors ${
              showPhotoField || mediaUrl ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <ImagePlus className="w-[18px] h-[18px]" />
          </button>

          <Button
            type="submit"
            disabled={creatingQuick}
            className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold gap-1.5 shrink-0"
          >
            {creatingQuick ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Criar</span>
          </Button>
        </div>

        {showPhotoField && (
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="Link da foto (opcional). Sem foto, a IA cria a arte com a sua marca."
            aria-label="Link da foto"
            className="h-10 bg-background border border-border rounded-xl px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        )}
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Sem ideia?</span>
        <button
          type="button"
          onClick={handleGenerateDaily}
          disabled={generatingDaily}
          className="inline-flex items-center gap-1.5 min-h-9 font-semibold text-primary hover:underline disabled:opacity-60"
        >
          {generatingDaily ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Gerar pauta de hoje (3 stories + 1 post)
        </button>
        <button
          type="button"
          onClick={handleNotifyWhatsApp}
          disabled={sendingWhatsApp}
          className="inline-flex items-center gap-1.5 min-h-9 font-medium hover:text-foreground disabled:opacity-60 sm:ml-auto"
        >
          {sendingWhatsApp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
          Resumo no WhatsApp
        </button>
      </div>
    </div>
  );
}
