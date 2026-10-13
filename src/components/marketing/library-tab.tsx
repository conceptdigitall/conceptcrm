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
        <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
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
                    ? 'border-primary bg-muted'
                    : 'border-border bg-card hover:border-primary/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-background text-primary">
                    {p.media_type === 'video' ? <Film className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground line-clamp-1">{p.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {p.kind.toUpperCase()} · v{p.version}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-background text-foreground/80 border border-border">
                  v{p.version}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Coluna da direita: Detalhes e Criador de Variação */}
      {currentPost ? (
        <div className="flex-1 w-full rounded-2xl border border-border bg-card p-6 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-xl font-heading font-bold text-foreground">{currentPost.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentPost.media_type} · Criado em {new Date(currentPost.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>

            {/* Abas de Versões (v1, v2, v3...) */}
            <div className="flex items-center gap-1.5 bg-background p-1 rounded-xl border border-border">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setCurrentId(v.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    currentPost.id === v.id
                      ? 'bg-primary text-primary-foreground shadow'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  v{v.version}
                </button>
              ))}
            </div>
          </div>

          {/* Prévia da Versão Selecionada */}
          <div className="p-4 rounded-xl border border-border bg-background flex flex-col gap-2">
            <span className="text-xs font-bold text-foreground">Texto / Legenda Atual (v{currentPost.version})</span>
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {currentPost.caption || currentPost.idea}
            </p>
          </div>

          {/* Seção: Mudar só isto, o resto fica igual */}
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider text-amber-600">
                Mudar só isto, o resto fica igual
              </h3>
              <p className="text-xs text-muted-foreground">
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
                        ? 'border-primary bg-muted text-foreground'
                        : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleField(f.key)}
                      className="border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                    />
                    <span className="text-xs font-semibold">{f.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Instrução da alteração para a nova versão:
              </label>
              <input
                type="text"
                placeholder="Ex: Troca o título para 'Seu site pronto em 7 dias' e deixa a chamada mais direta"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="bg-background border border-border rounded-lg px-3.5 py-2.5 text-base md:text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <Button
              onClick={handleCreateVariation}
              disabled={generating || !instruction.trim()}
              className="bg-primary hover:bg-primary-hover text-primary-foreground font-bold h-11 rounded-xl gap-2 shadow"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? 'Gerando versão...' : `Gerar v${currentPost.version + 1} a partir da v${currentPost.version}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl border border-border bg-card w-full">
          <p className="text-foreground">Nenhum post na biblioteca para editar variações.</p>
        </div>
      )}
    </div>
  );
}
