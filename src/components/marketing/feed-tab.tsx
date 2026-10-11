'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Plus, Send, Sparkles } from 'lucide-react';
import type { MarketingPost } from '@/types';
import { Button } from '@/components/ui/button';
import { STATUS_LABEL } from '@/lib/marketing/content';

interface FeedTabProps {
  posts: MarketingPost[];
  onOpenCreate: () => void;
  onPostUpdated: (updated: MarketingPost) => void;
  onNavigateToLibrary: (post: MarketingPost) => void;
}

const GRADIENTS = [
  'bg-gradient-to-br from-[#0624C7] to-[#04081E]',
  'bg-gradient-to-br from-[#14245C] to-[#030617]',
  'bg-gradient-to-br from-[#FCE026] via-[#c9a800] to-[#081030] text-[#04081E]',
  'bg-gradient-to-br from-[#3a52e0] via-[#0D1948] to-[#04081E]',
];

export function FeedTab({
  posts,
  onOpenCreate,
  onPostUpdated,
  onNavigateToLibrary,
}: FeedTabProps) {
  const [selectedId, setSelectedId] = useState<string>(() => posts[0]?.id || '');
  const [publishing, setPublishing] = useState(false);

  const selectedPost = posts.find((p) => p.id === selectedId) || posts[0] || null;

  async function handlePublishInstagram(post: MarketingPost) {
    setPublishing(true);
    try {
      const res = await fetch('/api/marketing/instagram/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao publicar no Instagram');

      toast.success('Post publicado com sucesso no Instagram!');
      onPostUpdated({
        ...post,
        status: 'published',
        instagram_media_id: data.mediaId,
        instagram_permalink: data.permalink,
        posted_at: data.postedAt,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na publicação';
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Coluna Principal da Grade */}
      <div className="flex-1 w-full flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-[#9FB0E6]">
            Próximos e Recentes
          </span>
          <Button
            onClick={onOpenCreate}
            className="bg-[#FCE026] hover:bg-[#e5ca1f] text-[#04081E] font-bold text-sm h-10 px-4 rounded-xl gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            + Criar post
          </Button>
        </div>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-[#14245C] bg-[#081030] text-center gap-3">
            <Sparkles className="w-8 h-8 text-[#FCE026]" />
            <p className="text-white font-medium">Nenhum post agendado ou criado ainda.</p>
            <p className="text-xs text-[#9FB0E6] max-w-sm">
              Gere seu primeiro post com IA para o Instagram da Concept Digital ou clientes.
            </p>
            <Button onClick={onOpenCreate} className="bg-[#FCE026] text-[#04081E] font-bold mt-2">
              Começar agora
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {posts.map((p, idx) => {
              const isSelected = selectedPost?.id === p.id;
              const grad = GRADIENTS[idx % GRADIENTS.length];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`flex flex-col gap-2 rounded-xl text-left transition-all p-1.5 ${
                    isSelected ? 'ring-2 ring-[#FCE026] bg-[#0D1948]/50' : 'hover:bg-[#0D1948]/30'
                  }`}
                >
                  <div
                    className={`w-full aspect-[4/5] rounded-lg p-3 flex flex-col justify-between relative overflow-hidden ${grad}`}
                  >
                    <span className="self-start text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-sm">
                      {p.media_type === 'video' ? 'Vídeo' : p.media_type === 'carrossel' ? 'Carrossel' : 'Foto'}
                    </span>
                    <span className="font-heading font-semibold text-xs leading-snug line-clamp-3">
                      {p.title}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-1 text-[11px]">
                    <span className="text-[#9FB0E6]">
                      {p.version > 1 ? `v${p.version}` : 'Hoje'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        p.status === 'published'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : p.status === 'pending_approval'
                          ? 'bg-amber-950 text-[#FCE026] border border-amber-800'
                          : 'bg-[#0D1948] text-[#9FB0E6]'
                      }`}
                    >
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Painel Lateral de Prévia (Desktop & Drawer Mobile) */}
      {selectedPost && (
        <aside className="w-full lg:w-80 xl:w-96 rounded-2xl border border-[#14245C] bg-[#081030] p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#14245C] pb-3">
            <span className="text-xs uppercase font-bold text-[#9FB0E6]">Prévia no Instagram</span>
            <span className="text-xs text-[#9FB0E6]">
              {selectedPost.media_type.toUpperCase()} · v{selectedPost.version}
            </span>
          </div>

          {/* Card Mockup Realista Instagram */}
          <div className="rounded-xl border border-[#14245C] bg-black overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 p-2.5 border-b border-[#14245C]/50 bg-[#04081E]">
              <div className="w-6 h-6 rounded-full bg-[#FCE026] text-[#04081E] font-bold text-xs flex items-center justify-center">
                C
              </div>
              <span className="text-xs font-bold text-white">conceptdigita.l</span>
            </div>

            <div className="aspect-[4/5] w-full bg-gradient-to-br from-[#0624C7] to-[#04081E] p-5 flex items-center justify-center text-center">
              <span className="font-heading font-bold text-lg md:text-xl text-white leading-tight">
                {selectedPost.title}
              </span>
            </div>

            <div className="p-3 text-xs leading-relaxed text-[#E1E7FC] flex flex-col gap-1.5">
              <p>
                <b className="text-white">conceptdigita.l</b> {selectedPost.caption || selectedPost.idea}
              </p>
              {selectedPost.instagram_permalink && (
                <a
                  href={selectedPost.instagram_permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#FCE026] hover:underline text-[11px] pt-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Ver publicação ao vivo
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            {selectedPost.status !== 'published' ? (
              <Button
                onClick={() => handlePublishInstagram(selectedPost)}
                disabled={publishing}
                className="w-full bg-[#FCE026] hover:bg-[#e5ca1f] text-[#04081E] font-bold h-11 rounded-xl gap-2 shadow"
              >
                <Send className="w-4 h-4" />
                {publishing ? 'Publicando...' : 'Aprovar e Publicar no Instagram'}
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-2 p-2 rounded-xl bg-emerald-950/40 text-emerald-400 border border-emerald-800 text-xs font-semibold">
                <Check className="w-4 h-4" />
                Publicado no Instagram
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => onNavigateToLibrary(selectedPost)}
              className="w-full border-[#14245C] bg-[#0D1948] text-white hover:bg-[#14245C] text-xs h-9 rounded-xl"
            >
              Mudar um detalhe (Biblioteca)
            </Button>
          </div>
        </aside>
      )}

      {/* FAB Mobile Flutuante */}
      <button
        type="button"
        onClick={onOpenCreate}
        className="lg:hidden fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-[#FCE026] text-[#04081E] font-bold px-4 py-3 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-transform"
      >
        <Plus className="w-5 h-5" />
        Criar post
      </button>
    </div>
  );
}
