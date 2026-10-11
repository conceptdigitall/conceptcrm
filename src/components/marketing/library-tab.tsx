'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Film, FileText } from 'lucide-react';
import type { MarketingPost } from '@/types';
import { VARIATION_FIELDS, variationPrompt } from '@/lib/marketing/content';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface LibraryTabProps {
  posts: MarketingPost[];
  onPostCreated: (newPost: MarketingPost) => void;
  selectedPostId?: string;
}

export function LibraryTab({
  posts,
  onPostCreated,
  selectedPostId,
}: LibraryTabProps) {
  const [currentId, setCurrentId] = useState<string>(() => selectedPostId || posts[0]?.id || '');
  const [selectedFields, setSelectedFields] = useState<string[]>(['titulo']);
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);

  // Encontra o post selecionado
  const currentPost = posts.find((p) => p.id === currentId) || posts[0] || null;

  // Encontra todas as versões da mesma família (mesmo parent_id ou id)
  const familyRootId = currentPost?.parent_id || currentPost?.id;
  const versions = posts
    .filter((p) => p.id === familyRootId || p.parent_id === familyRootId)
    .sort((a, b) => a.version - b.version);

  function toggleField(fieldKey: string) {
    setSelectedFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((f) => f !== fieldKey) : [...prev, fieldKey],
    );
  }

  async function handleCreateVariation() {
    if (!currentPost) return;
    if (!instruction.trim()) {
      toast.error('Informe a instrução de alteração para a nova versão.');
      return;
    }

    setGenerating(true);
    try {
      const labels = selectedFields.map((k) => VARIATION_FIELDS.find((f) => f.key === k)?.label || k);
      const newPrompt = variationPrompt(currentPost.caption || currentPost.idea, labels, instruction);

      const res = await fetch('/api/marketing/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: currentPost.kind,
          media_type: currentPost.media_type,
          title: `${currentPost.title} (v${currentPost.version + 1})`,
          idea: newPrompt,
          caption: currentPost.caption,
          media_urls: currentPost.media_urls,
          parent_id: familyRootId,
          status: 'draft',
        }),
      });

      if (!res.ok) throw new Error('Falha ao criar nova versão');
      const data = await res.json();
      toast.success(`Versão v${data.post.version} criada com sucesso!`);
      onPostCreated(data.post);
      setCurrentId(data.post.id);
      setInstruction('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar variação';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Coluna da esquerda: Lista de Peças */}
      <div className="w-full lg:w-80 flex flex-col gap-3">
        <span className="text-xs uppercase font-semibold text-[#9FB0E6] tracking-wider">
          Peças na Biblioteca
        </span>
        <div className="flex flex-col gap-2">
          {posts.map((p) => {
            const isSelected = currentPost?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setCurrentId(p.id)}
                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-[#FCE026] bg-[#0D1948]'
                    : 'border-[#14245C] bg-[#081030] hover:border-[#FCE026]/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-[#04081E] text-[#FCE026]">
                    {p.media_type === 'video' ? <Film className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white line-clamp-1">{p.title}</span>
                    <span className="text-[10px] text-[#9FB0E6]">
                      {p.kind.toUpperCase()} · v{p.version}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#04081E] text-[#C9D4F5] border border-[#14245C]">
                  v{p.version}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Coluna da direita: Detalhes e Criador de Variação */}
      {currentPost ? (
        <div className="flex-1 w-full rounded-2xl border border-[#14245C] bg-[#081030] p-6 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#14245C] pb-4">
            <div>
              <h2 className="text-xl font-heading font-bold text-white">{currentPost.title}</h2>
              <p className="text-xs text-[#9FB0E6] mt-0.5">
                {currentPost.media_type} · Criado em {new Date(currentPost.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>

            {/* Abas de Versões (v1, v2, v3...) */}
            <div className="flex items-center gap-1.5 bg-[#04081E] p-1 rounded-xl border border-[#14245C]">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setCurrentId(v.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    currentPost.id === v.id
                      ? 'bg-[#0624C7] text-white shadow'
                      : 'text-[#9FB0E6] hover:text-white'
                  }`}
                >
                  v{v.version}
                </button>
              ))}
            </div>
          </div>

          {/* Prévia da Versão Selecionada */}
          <div className="p-4 rounded-xl border border-[#14245C] bg-[#04081E] flex flex-col gap-2">
            <span className="text-xs font-bold text-white">Texto / Legenda Atual (v{currentPost.version})</span>
            <p className="text-xs text-[#C9D4F5] leading-relaxed whitespace-pre-wrap">
              {currentPost.caption || currentPost.idea}
            </p>
          </div>

          {/* Seção: Mudar só isto, o resto fica igual */}
          <div className="flex flex-col gap-4 border-t border-[#14245C] pt-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-amber-300">
                Mudar só isto, o resto fica igual
              </h3>
              <p className="text-xs text-[#9FB0E6]">
                Marque o que deseja alterar para gerar a próxima versão mantendo todo o resto consistente.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {VARIATION_FIELDS.map((f) => {
                const checked = selectedFields.includes(f.key);
                return (
                  <label
                    key={f.key}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                      checked
                        ? 'border-[#FCE026] bg-[#0D1948] text-white'
                        : 'border-[#14245C] bg-[#04081E] text-[#9FB0E6]'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleField(f.key)}
                      className="border-[#14245C] data-[state=checked]:bg-[#FCE026] data-[state=checked]:text-[#04081E]"
                    />
                    <span className="text-xs font-semibold">{f.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#9FB0E6]">
                Instrução da alteração para a nova versão:
              </label>
              <input
                type="text"
                placeholder="Ex: Troca o título para 'Seu site pronto em 7 dias' e deixa a chamada mais direta"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="bg-[#04081E] border border-[#14245C] rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#FCE026]"
              />
            </div>

            <Button
              onClick={handleCreateVariation}
              disabled={generating || !instruction.trim()}
              className="bg-[#FCE026] hover:bg-[#e5ca1f] text-[#04081E] font-bold h-11 rounded-xl gap-2 shadow"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? 'Gerando versão...' : `Gerar v${currentPost.version + 1} a partir da v${currentPost.version}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl border border-[#14245C] bg-[#081030] w-full">
          <p className="text-white">Nenhum post na biblioteca para editar variações.</p>
        </div>
      )}
    </div>
  );
}
