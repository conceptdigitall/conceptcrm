'use client';

import { useState } from 'react';
import { Camera, Film, Layers, Sparkles, ArrowLeft } from 'lucide-react';
import type { MarketingPost, MarketingSettings, PostKind, PostMediaType } from '@/types';
import { buildCaption } from '@/lib/marketing/content';
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

  function handleSelectType(type: PostMediaType) {
    setMediaType(type);
    setStep(2);
  }

  function handleGenerateCaption() {
    if (!idea.trim()) return;
    const gen = buildCaption(settings, idea.trim());
    setCaption(gen);
    if (!title.trim()) {
      setTitle(idea.trim().slice(0, 40));
    }
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
      onOpenChange(false);
      // Reset form
      setStep(1);
      setTitle('');
      setIdea('');
      setCaption('');
      setMediaUrl('');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#081030] border-[#14245C] text-white p-6 rounded-2xl">
        <DialogHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-[#9FB0E6] hover:text-white p-1 rounded-lg"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <DialogTitle className="text-lg font-bold">
              {step === 1 ? 'O que vamos postar?' : 'Ideia e Conteúdo'}
            </DialogTitle>
          </div>
        </DialogHeader>

        {step === 1 ? (
          <div className="flex flex-col gap-3 py-2">
            <button
              type="button"
              onClick={() => handleSelectType('foto')}
              className="flex items-start gap-4 p-4 rounded-xl border border-[#14245C] bg-[#04081E] hover:border-[#FCE026] transition-colors text-left group"
            >
              <div className="p-2.5 rounded-lg bg-[#0D1948] text-[#FCE026] group-hover:bg-[#FCE026] group-hover:text-[#04081E] transition-colors">
                <Camera className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-white">Foto</span>
                <span className="text-xs text-[#9FB0E6]">1 imagem com texto e legenda estratégica</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectType('carrossel')}
              className="flex items-start gap-4 p-4 rounded-xl border border-[#14245C] bg-[#04081E] hover:border-[#FCE026] transition-colors text-left group"
            >
              <div className="p-2.5 rounded-lg bg-[#0D1948] text-[#FCE026] group-hover:bg-[#FCE026] group-hover:text-[#04081E] transition-colors">
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-white">Carrossel</span>
                <span className="text-xs text-[#9FB0E6]">Até 10 telas em sequência educativa</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectType('video')}
              className="flex items-start gap-4 p-4 rounded-xl border border-[#14245C] bg-[#04081E] hover:border-[#FCE026] transition-colors text-left group"
            >
              <div className="p-2.5 rounded-lg bg-[#0D1948] text-[#FCE026] group-hover:bg-[#FCE026] group-hover:text-[#04081E] transition-colors">
                <Film className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-white">Vídeo (Reel)</span>
                <span className="text-xs text-[#9FB0E6]">Com narração, ritmo dinâmico e trilha sonora</span>
              </div>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#9FB0E6]">Título do post na grade</label>
              <input
                type="text"
                placeholder="Ex: 3 erros no WhatsApp da sua empresa"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-[#04081E] border border-[#14245C] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FCE026]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#9FB0E6]">Qual é a ideia principal?</label>
                <button
                  type="button"
                  onClick={handleGenerateCaption}
                  disabled={!idea.trim()}
                  className="inline-flex items-center gap-1 text-xs text-[#FCE026] hover:underline disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />
                  Gerar legenda com IA
                </button>
              </div>
              <textarea
                rows={2}
                placeholder="Ex: Como pequenos negócios perdem vendas por demorar mais de 10 min para responder..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className="bg-[#04081E] border border-[#14245C] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#FCE026] resize-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#9FB0E6]">Legenda e hashtags</label>
              <textarea
                rows={3}
                placeholder="Legenda completa que irá para o Instagram..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="bg-[#04081E] border border-[#14245C] rounded-lg p-3 text-xs text-white focus:outline-none focus:border-[#FCE026] resize-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#9FB0E6]">URL da Imagem / Mídia (opcional)</label>
              <input
                type="url"
                placeholder="https://... (ou deixe vazio para arte automática)"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                className="bg-[#04081E] border border-[#14245C] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FCE026]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSave('draft')}
                disabled={saving || (!title && !idea)}
                className="flex-1 border-[#14245C] bg-[#0D1948] text-white hover:bg-[#14245C]"
              >
                Salvar Rascunho
              </Button>
              <Button
                type="button"
                onClick={() => handleSave('pending_approval')}
                disabled={saving || (!title && !idea)}
                className="flex-1 bg-[#FCE026] hover:bg-[#e5ca1f] text-[#04081E] font-bold"
              >
                Pedir Aprovação
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
