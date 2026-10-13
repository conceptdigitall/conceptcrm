'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Globe, Sparkles, Upload } from 'lucide-react';
import type { MarketingProject, ProjectCategory } from '@/types';
import { PROJECT_DURATIONS, PROJECT_VIDEO_KINDS, projectVideoPrompt, type ProjectVideoKind } from '@/lib/marketing/content';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ProjectsTabProps {
  projects: MarketingProject[];
  onGenerateFromProject: (prompt: string, project: MarketingProject) => void;
}

export function ProjectsTab({
  projects,
  onGenerateFromProject,
}: ProjectsTabProps) {
  const [filter, setFilter] = useState<ProjectCategory | 'todas'>('todas');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => projects[0]?.id || '');
  const [videoKind, setVideoKind] = useState<ProjectVideoKind>('mockup');
  const [duration, setDuration] = useState<15 | 30 | 45>(15);
  const [customPrintUrl, setCustomPrintUrl] = useState('');

  const filteredProjects = projects.filter((p) => filter === 'todas' || p.category === filter);
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  function handleGenerate() {
    if (!selectedProject) return;
    const prompt = projectVideoPrompt(selectedProject, videoKind, duration);
    toast.success(`Prompt gerado para ${selectedProject.name}!`);
    onGenerateFromProject(prompt, selectedProject);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filtros de Categoria */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(['todas', 'landing', 'recepcionista', 'marketing'] as const).map((cat) => {
          const label =
            cat === 'todas'
              ? 'Todos os Projetos'
              : cat === 'landing'
              ? 'Landing Pages'
              : cat === 'recepcionista'
              ? 'Recepcionista IA'
              : 'Marketing com IA';
          const isActive = filter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Lista de Projetos */}
        <div className="flex-1 w-full flex flex-col gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            De qual projeto?
          </span>
          <div className="flex flex-col gap-2.5">
            {filteredProjects.map((p) => {
              const isSelected = selectedProject?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-muted'
                      : 'border-border bg-card hover:border-primary/40'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-heading font-semibold text-foreground text-sm">
                      {p.name}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {p.category === 'landing' ? 'Landing Page' : p.category}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase font-bold ${
                      p.status === 'live'
                        ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
                        : p.status === 'building'
                        ? 'border-amber-500/40 text-amber-600 bg-amber-500/10'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {p.status === 'live' ? 'No ar' : p.status === 'building' ? 'Em andamento' : 'Em breve'}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel de Configuração do Vídeo */}
        {selectedProject && (
          <aside className="w-full lg:w-96 rounded-2xl border border-border bg-card p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-heading font-bold text-foreground text-base">{selectedProject.name}</h3>
                {selectedProject.url ? (
                  <a
                    href={selectedProject.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                  >
                    <Globe className="w-3 h-3" />
                    {selectedProject.url.replace(/^https?:\/\//, '')}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Projeto em desenvolvimento</span>
                )}
              </div>
            </div>

            {/* Tipo de Vídeo */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted-foreground">Tipo de Vídeo</label>
              <div className="flex flex-col gap-2">
                {PROJECT_VIDEO_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setVideoKind(k.value)}
                    className={`p-3 rounded-xl border text-left transition-colors flex flex-col gap-0.5 ${
                      videoKind === k.value
                        ? 'border-primary bg-muted'
                        : 'border-border bg-background hover:border-border/80'
                    }`}
                  >
                    <span className="font-semibold text-foreground text-xs">{k.label}</span>
                    <span className="text-[11px] text-muted-foreground">{k.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Duração */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted-foreground">Duração do Reel</label>
              <div className="flex gap-2">
                {PROJECT_DURATIONS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setDuration(sec)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                      duration === sec
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    {sec} segundos
                  </button>
                ))}
              </div>
            </div>

            {/* Fallback de upload caso sem URL pública */}
            {!selectedProject.url && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5 text-primary" />
                  Upload de print manual (Fallback)
                </label>
                <input
                  type="url"
                  placeholder="Cole o link da imagem/print..."
                  value={customPrintUrl}
                  onChange={(e) => setCustomPrintUrl(e.target.value)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            )}

            <Button
              onClick={handleGenerate}
              className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-bold h-11 rounded-xl gap-2 shadow"
            >
              <Sparkles className="w-4 h-4" />
              Continuar / Gerar Vídeo
            </Button>
          </aside>
        )}
      </div>
    </div>
  );
}
