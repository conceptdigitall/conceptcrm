'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, MessageCircle, Mic, MicOff, Send, Sparkles } from 'lucide-react';
import type { MarketingPost, MarketingSettings } from '@/types';
import { getNichePreset } from '@/lib/marketing/niche-autopilot';
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

  const nichePreset = getNichePreset(settings.business_niche);

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

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5 flex flex-col gap-4">
      {/* Linha Superior: Pauta Automática do Dia + WhatsApp */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Ramo: {nichePreset.label}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground font-semibold">
              {settings.require_approval ? '🛡️ Você aprova antes' : '🚀 Piloto Automático'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Gere os 3 Stories + 1 Post do dia automaticamente ou mande um áudio/foto rápida abaixo:
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleGenerateDaily}
            disabled={generatingDaily}
            className="bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold h-9 px-3.5 rounded-xl gap-1.5"
          >
            {generatingDaily ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Gerar Pauta de Hoje (3 Stories + 1 Post)
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleNotifyWhatsApp}
            disabled={sendingWhatsApp}
            className="text-xs font-semibold h-9 px-3 rounded-xl gap-1.5"
          >
            {sendingWhatsApp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5 text-primary" />}
            Receber no WhatsApp
          </Button>
        </div>
      </div>

      {/* Linha Inferior: Input Rápido por Voz / Texto / Foto */}
      <form onSubmit={handleQuickCreate} className="flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex rounded-xl border border-border bg-background p-1 shrink-0 self-start">
            {(['story', 'feed'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setQuickKind(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  quickKind === k
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {k === 'story' ? '📱 Story Rápido' : '🖼️ Post Feed'}
              </button>
            ))}
          </div>

          <div className="flex-1 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleVoiceRecording}
              title={recording ? 'Parar gravação' : 'Falar pelo microfone'}
              className={`h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold shrink-0 transition-colors ${
                recording
                  ? 'bg-destructive/15 border-destructive text-destructive animate-pulse'
                  : 'bg-background border-border text-foreground hover:border-primary'
              }`}
            >
              {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-primary" />}
              <span className="hidden md:inline">{recording ? 'Ouvindo...' : 'Falar'}</span>
            </button>

            <input
              type="text"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder='Ex: "Promoção hoje de corte + barba por R$ 65, chama no zap!"'
              className="flex-1 h-10 bg-background border border-border rounded-xl px-3.5 text-sm text-foreground focus:outline-none focus:border-primary"
            />

            <button
              type="button"
              onClick={() => setShowPhotoField((v) => !v)}
              title="Anexar link de foto do produto ou serviço"
              className={`h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-semibold shrink-0 transition-colors ${
                showPhotoField || mediaUrl
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <ImagePlus className="w-4 h-4" />
              <span className="hidden md:inline">Foto</span>
            </button>

            <Button
              type="submit"
              disabled={creatingQuick}
              className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold gap-1.5 shrink-0"
            >
              {creatingQuick ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Criar
            </Button>
          </div>
        </div>

        {showPhotoField && (
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="Cole o link da foto do produto/serviço (opcional)..."
            className="h-9 bg-background border border-border rounded-lg px-3 text-xs text-foreground focus:outline-none focus:border-primary"
          />
        )}
      </form>
    </div>
  );
}
