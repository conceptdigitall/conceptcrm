'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Send, Check, Smartphone, Link as LinkIcon } from 'lucide-react';
import type { MarketingPost, StoryInteraction } from '@/types';
import { Button } from '@/components/ui/button';

interface StoriesTabProps {
  stories: MarketingPost[];
  onOpenCreateStory: () => void;
  onStoryUpdated: (updated: MarketingPost) => void;
}

export function StoriesTab({
  stories,
  onOpenCreateStory,
  onStoryUpdated,
}: StoriesTabProps) {
  const [selectedId, setSelectedId] = useState<string>(() => stories[0]?.id || '');
  const [publishing, setPublishing] = useState(false);
  const [interaction, setInteraction] = useState<StoryInteraction>('enquete');

  const selectedStory = stories.find((s) => s.id === selectedId) || stories[0] || null;

  async function handlePublishStory(story: MarketingPost) {
    setPublishing(true);
    try {
      const res = await fetch('/api/marketing/instagram/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: story.id,
          kind: 'story',
          mediaUrls: story.media_urls?.length ? story.media_urls : ['https://conceptdigital.com.br/story-mockup.jpg'],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao publicar Story');

      toast.success('Story publicado no Instagram com sucesso!');
      onStoryUpdated({
        ...story,
        status: 'published',
        instagram_media_id: data.mediaId,
        posted_at: data.postedAt,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na publicação do Story';
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Fileira de Stories Circulares */}
      <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none">
        <button
          type="button"
          onClick={onOpenCreateStory}
          className="flex flex-col items-center gap-2 group flex-none"
        >
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#FCE026] flex items-center justify-center text-[#FCE026] group-hover:scale-105 transition-transform bg-[#081030]">
            <Plus className="w-6 h-6" />
          </div>
          <span className="text-xs font-bold text-[#FCE026]">+ Criar story</span>
        </button>

        {stories.map((s, idx) => {
          const isSelected = selectedStory?.id === s.id;
          const label = idx === 0 ? 'Hoje' : idx === 1 ? 'Amanhã' : `Dia ${idx + 1}`;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className="flex flex-col items-center gap-1.5 group flex-none"
            >
              <div
                className={`w-16 h-16 rounded-full p-0.5 transition-transform ${
                  isSelected ? 'ring-2 ring-[#FCE026] scale-105' : 'hover:scale-102'
                }`}
              >
                <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#0624C7] to-[#14245C] flex items-center justify-center border border-[#14245C] text-white font-bold text-xs p-1 text-center line-clamp-2">
                  {s.title.slice(0, 12)}
                </div>
              </div>
              <span className="text-xs text-white font-medium">{label}</span>
              <span
                className={`text-[9px] px-1.5 rounded ${
                  s.status === 'published' ? 'bg-emerald-950 text-emerald-400' : 'bg-[#0D1948] text-[#9FB0E6]'
                }`}
              >
                {s.status === 'published' ? 'No ar' : 'Pendente'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Área Central: Prévia Smartphone 9:16 */}
      {selectedStory ? (
        <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-center p-6 rounded-2xl border border-[#14245C] bg-[#081030]">
          {/* Frame Vertical 9:16 */}
          <div className="relative w-64 md:w-72 aspect-[9/16] rounded-[28px] border-4 border-[#14245C] bg-gradient-to-b from-[#0624C7] via-[#04081E] to-[#04081E] p-4 flex flex-col justify-between shadow-2xl overflow-hidden">
            {/* Barras de progresso do story */}
            <div className="flex gap-1.5 w-full pt-1">
              <div className="flex-1 h-1 rounded-full bg-white" />
              <div className="flex-1 h-1 rounded-full bg-white/40" />
              <div className="flex-1 h-1 rounded-full bg-white/40" />
            </div>

            {/* Cabeçalho do perfil */}
            <div className="flex items-center gap-2 pt-2">
              <div className="w-6 h-6 rounded-full bg-[#FCE026] text-[#04081E] text-xs font-bold flex items-center justify-center">
                C
              </div>
              <span className="text-xs font-bold text-white">conceptdigita.l</span>
              <span className="text-[10px] text-white/60">3h</span>
            </div>

            {/* Texto Central */}
            <div className="my-auto text-center px-3 py-6">
              <h2 className="font-heading font-bold text-lg md:text-xl text-white leading-snug drop-shadow-md">
                {selectedStory.title}
              </h2>
              {selectedStory.idea && (
                <p className="text-xs text-[#E1E7FC] mt-2 opacity-90 line-clamp-3">
                  {selectedStory.idea}
                </p>
              )}
            </div>

            {/* Elemento Interativo Mockup */}
            {interaction === 'enquete' && (
              <div className="w-full bg-black/60 backdrop-blur-md border border-white/20 rounded-xl p-3 flex flex-col gap-2 mb-3">
                <span className="text-[11px] font-semibold text-center text-white">
                  Sua empresa perde leads hoje?
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <div className="py-2 bg-white/10 hover:bg-white/20 rounded-lg text-center text-white">
                    Sim, muitos 😭
                  </div>
                  <div className="py-2 bg-[#FCE026]/90 rounded-lg text-center text-[#04081E]">
                    Não, temos IA 🚀
                  </div>
                </div>
              </div>
            )}

            {interaction === 'link' && (
              <div className="self-center bg-[#FCE026] text-[#04081E] font-bold text-xs px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg mb-4">
                <LinkIcon className="w-3.5 h-3.5" />
                <span>conceptdigital.com.br</span>
              </div>
            )}
          </div>

          {/* Controles Laterais */}
          <div className="flex-1 max-w-md flex flex-col gap-5">
            <div>
              <h3 className="text-lg font-bold text-white">Configuração do Story</h3>
              <p className="text-xs text-[#9FB0E6]">
                Stories verticais de alta retenção no Instagram da Concept Digital.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[#9FB0E6]">Tipo de Interação</label>
              <div className="flex gap-2">
                {(['nenhuma', 'enquete', 'link'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setInteraction(opt)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors capitalize ${
                      interaction === opt
                        ? 'bg-[#0624C7] border-[#FCE026] text-white'
                        : 'border-[#14245C] bg-[#04081E] text-[#9FB0E6] hover:text-white'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 pt-4 border-t border-[#14245C]">
              {selectedStory.status !== 'published' ? (
                <Button
                  onClick={() => handlePublishStory(selectedStory)}
                  disabled={publishing}
                  className="bg-[#FCE026] hover:bg-[#e5ca1f] text-[#04081E] font-bold h-11 rounded-xl gap-2 shadow"
                >
                  <Send className="w-4 h-4" />
                  {publishing ? 'Publicando...' : 'Aprovar e Publicar Story'}
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-950/40 text-emerald-400 border border-emerald-800 text-xs font-semibold">
                  <Check className="w-4 h-4" />
                  Story Publicado no Instagram
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl border border-[#14245C] bg-[#081030]">
          <Smartphone className="w-8 h-8 text-[#FCE026] mx-auto mb-2" />
          <p className="text-white font-medium">Nenhum story planejado para esta semana.</p>
          <Button onClick={onOpenCreateStory} className="bg-[#FCE026] text-[#04081E] font-bold mt-3">
            + Criar primeiro story
          </Button>
        </div>
      )}
    </div>
  );
}
