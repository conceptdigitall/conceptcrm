'use client';

import { useState } from 'react';
import { Plus, Send, Check, Smartphone, Megaphone } from 'lucide-react';
import type { MarketingPost } from '@/types';
import { Button } from '@/components/ui/button';
import { PostVisual } from '@/components/marketing/post-visual';
import { usePostPublisher } from '@/components/marketing/use-post-publisher';

interface StoriesTabProps {
  stories: MarketingPost[];
  onOpenCreateStory: () => void;
  onStoryUpdated: (updated: MarketingPost) => void;
  onConvertToAd?: (story: MarketingPost) => void;
}

export function StoriesTab({
  stories,
  onOpenCreateStory,
  onStoryUpdated,
  onConvertToAd,
}: StoriesTabProps) {
  const [selectedId, setSelectedId] = useState<string>(() => stories[0]?.id || '');

  const selectedStory = stories.find((s) => s.id === selectedId) || stories[0] || null;

  const { publish: handlePublishStory, busy: publishing } = usePostPublisher(selectedStory, onStoryUpdated, {
    success: 'Story publicado no Instagram com sucesso!',
    fallback: 'Falha na publicação do Story',
    // Sem mídia, o servidor gera a arte do story (antes ia uma imagem fixa de exemplo).
    extra: { kind: 'story' },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Fileira de Stories Circulares */}
      <div className="flex items-start gap-4 overflow-x-auto px-1 pt-1 pb-2 scrollbar-none">
        <button
          type="button"
          onClick={onOpenCreateStory}
          className="flex w-[72px] flex-none flex-col items-center gap-1.5 group"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary bg-card text-primary transition-transform group-hover:scale-105 group-active:scale-95">
            <Plus className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-primary">Novo</span>
        </button>

        {stories.map((s, idx) => {
          const isSelected = selectedStory?.id === s.id;
          const label = idx === 0 ? 'Hoje' : idx === 1 ? 'Amanhã' : `Dia ${idx + 1}`;
          const published = s.status === 'published';
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              aria-pressed={isSelected}
              className="flex w-[72px] flex-none flex-col items-center gap-1.5 group"
            >
              {/* Anel no estilo Instagram: colorido enquanto não foi ao ar */}
              <div
                className={`h-16 w-16 rounded-full p-[3px] transition-transform group-active:scale-95 ${
                  published ? 'bg-border' : 'bg-gradient-to-tr from-primary to-[#FCE026]'
                } ${isSelected ? 'scale-105 shadow-lg shadow-primary/30' : ''}`}
              >
                <div className="h-full w-full overflow-hidden rounded-full border-2 border-background bg-muted">
                  <PostVisual post={s} className="h-full w-full object-cover" />
                </div>
              </div>
              <span className={`text-xs ${isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  published ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                }`}
              >
                {published ? 'No ar' : 'Pendente'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Área Central: Prévia Smartphone 9:16 */}
      {selectedStory ? (
        <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-center p-6 rounded-2xl border border-border bg-card">
          {/* Frame Vertical 9:16 */}
          <div className="relative w-64 md:w-72 aspect-[9/16] rounded-[32px] border-4 border-border bg-muted shadow-2xl overflow-hidden">
            <PostVisual post={selectedStory} controls className="absolute inset-0 h-full w-full object-cover" />
            {/* Barras de progresso por cima da arte, como no app do Instagram */}
            <div className="absolute inset-x-3 top-3 flex gap-1.5">
              <div className="flex-1 h-1 rounded-full bg-white" />
              <div className="flex-1 h-1 rounded-full bg-white/40" />
              <div className="flex-1 h-1 rounded-full bg-white/40" />
            </div>
          </div>

          {/* Controles Laterais */}
          <div className="flex-1 max-w-md flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-foreground font-heading">{selectedStory.title}</h3>
              {selectedStory.idea && (
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedStory.idea}</p>
              )}
            </div>

            <div className="flex flex-col gap-2.5 pt-4 border-t border-border">
              {selectedStory.status !== 'published' ? (
                <Button
                  onClick={handlePublishStory}
                  disabled={publishing}
                  className="bg-primary hover:bg-primary-hover text-primary-foreground font-bold h-11 rounded-xl gap-2 shadow"
                >
                  <Send className="w-4 h-4" />
                  {publishing ? 'Publicando...' : 'Aprovar e Publicar Story'}
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-xs font-semibold">
                  <Check className="w-4 h-4" />
                  Story Publicado no Instagram
                </div>
              )}

              {onConvertToAd && (
                <Button
                  type="button"
                  onClick={() => onConvertToAd(selectedStory)}
                  className="bg-[#FCE026] hover:bg-[#f2d313] text-slate-950 font-bold text-xs h-10 rounded-xl gap-1.5 shadow-sm"
                >
                  <Megaphone className="w-4 h-4" />
                  Transformar Story em Anúncio IA (1 Clique)
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl border border-border bg-card">
          <Smartphone className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-foreground font-medium">Nenhum story planejado para esta semana.</p>
          <Button onClick={onOpenCreateStory} className="bg-primary text-primary-foreground font-bold mt-3">
            + Criar primeiro story
          </Button>
        </div>
      )}
    </div>
  );
}
