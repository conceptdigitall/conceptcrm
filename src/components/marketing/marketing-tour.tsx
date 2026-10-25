'use client';

import { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clapperboard,
  FolderKanban,
  LayoutGrid,
  Megaphone,
  Settings2,
  Smartphone,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MarketingSubtab } from '@/components/marketing/marketing-tabs-header';

interface TourStep {
  tab: MarketingSubtab;
  icon: LucideIcon;
  title: string;
  body: string;
}

// Um passo por subaba, em linguagem de dono de negócio, sem jargão.
export const TOUR_STEPS: TourStep[] = [
  {
    tab: 'feed',
    icon: Sparkles,
    title: 'Bem-vindo ao seu marketing com IA',
    body: 'Em menos de 1 minuto te mostro onde fica cada coisa. Pode pular quando quiser e reabrir em "Como funciona?".',
  },
  {
    tab: 'feed',
    icon: LayoutGrid,
    title: 'Feed: posts do seu perfil',
    body: 'Escreva ou fale o que quer postar. A IA cria a arte com a sua marca e a legenda. Nada vai para o Instagram sem você aprovar.',
  },
  {
    tab: 'stories',
    icon: Smartphone,
    title: 'Stories: 3 por dia',
    body: 'Manhã, tarde e noite. Toque num círculo para ver como fica no celular e aprovar.',
  },
  {
    tab: 'videos',
    icon: Clapperboard,
    title: 'Vídeos: Reels prontos',
    body: 'Diga o tema em uma frase. A IA monta o vídeo com narração e trilha para Reels ou Story.',
  },
  {
    tab: 'ads',
    icon: Megaphone,
    title: 'Tráfego IA: anúncios pagos',
    body: 'Pegue um post que foi bem e transforme em anúncio. A IA sugere público, orçamento e texto.',
  },
  {
    tab: 'projects',
    icon: FolderKanban,
    title: 'Projetos: seus trabalhos viram conteúdo',
    body: 'Cadastre um serviço ou caso de sucesso e gere posts e vídeos sobre ele com 1 clique.',
  },
  {
    tab: 'library',
    icon: BookOpen,
    title: 'Biblioteca: tudo guardado',
    body: 'Todas as versões ficam salvas. Quer mudar só um detalhe de um post? É aqui.',
  },
  {
    tab: 'settings',
    icon: Settings2,
    title: 'Ajustes: comece por aqui',
    body: 'Diga o nome e o ramo do negócio, escolha entre aprovar antes ou piloto automático e conecte Instagram e WhatsApp.',
  },
];

interface MarketingTourProps {
  step: number;
  onStepChange: (step: number) => void;
  /** Fecha o tour; `finished` diz se a pessoa chegou ao fim (e não só pulou). */
  onClose: (finished: boolean) => void;
}

export function MarketingTour({ step, onStepChange, onClose }: MarketingTourProps) {
  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;
  const Icon = current.icon;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(false);
      if (e.key === 'ArrowRight' && !isLast) onStepChange(step + 1);
      if (e.key === 'ArrowLeft' && !isFirst) onStepChange(step - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, isFirst, isLast, onClose, onStepChange]);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="marketing-tour-title"
      className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0 lg:w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-2xl shadow-black/40 sm:gap-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary sm:h-10 sm:w-10">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Passo {step + 1} de {TOUR_STEPS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onClose(false)}
            aria-label="Pular tutorial"
            className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 id="marketing-tour-title" className="font-heading text-base font-bold text-foreground">
            {current.title}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{current.body}</p>
        </div>

        <div className="flex gap-1" aria-hidden>
          {TOUR_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          {isFirst ? (
            <button
              type="button"
              onClick={() => onClose(false)}
              className="min-h-10 px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Agora não
            </button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onStepChange(step - 1)} className="h-10 rounded-xl gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          )}

          <Button
            type="button"
            onClick={() => (isLast ? onClose(true) : onStepChange(step + 1))}
            className="h-10 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover gap-1.5"
          >
            {isFirst ? 'Começar' : isLast ? 'Configurar meu negócio' : 'Próximo'}
            {!isLast && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
