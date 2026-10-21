'use client';

import { useState } from 'react';
import { CheckCircle2, HelpCircle, Mic, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MarketingTutorialBannerProps {
  completed?: boolean;
  businessName?: string;
  requireApproval: boolean;
  onOpenSettings: () => void;
  onGenerateDaily: () => void;
  onDismissTutorial: () => void;
}

export function MarketingTutorialBanner({
  completed = false,
  businessName,
  requireApproval,
  onOpenSettings,
  onGenerateDaily,
  onDismissTutorial,
}: MarketingTutorialBannerProps) {
  const [expanded, setExpanded] = useState(!completed);

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>
            {businessName?.trim() ? (
              <>Marketing de <strong className="text-foreground">{businessName}</strong> ativo</>
            ) : (
              <>Sua máquina de postagens com IA está pronta</>
            )}
            {' • '}
            <strong className="text-foreground">
              {requireApproval ? '🛡️ Modo Aprovar Antes' : '🚀 Modo Piloto Automático'}
            </strong>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Como funciona? (Abrir Tutorial)
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Tutorial passo a passo para usar o Marketing com IA"
      className="rounded-2xl border border-primary/30 bg-card p-5 flex flex-col gap-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            Guia Rápido • Feito para ser simples
          </span>
          <h2 className="text-base md:text-lg font-heading font-bold text-foreground">
            Como funciona o seu Instagram com IA em 3 passos simples
          </h2>
          <p className="text-xs text-muted-foreground">
            Você não precisa entender de marketing nem de design. A IA trabalha pelo seu negócio todos os dias:
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            onDismissTutorial();
          }}
          title="Fechar tutorial"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Passo 1 */}
        <div className="rounded-xl border border-border bg-background p-4 flex flex-col justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span className="text-xs font-bold text-foreground">Escolha seu Ramo e Estilo</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Diga qual é o seu negócio (Barbearia, Clínica, Adega, Loja...) e escolha se prefere{' '}
              <strong className="text-foreground">aprovar cada post antes</strong> ou deixar no{' '}
              <strong className="text-foreground">Piloto Automático</strong>.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="w-full text-xs font-semibold h-8 rounded-lg"
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-primary" />
            Configurar Meu Negócio
          </Button>
        </div>

        {/* Passo 2 */}
        <div className="rounded-xl border border-border bg-background p-4 flex flex-col justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span className="text-xs font-bold text-foreground">Pauta do Dia ou Áudio Rápido</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Clique em <strong className="text-foreground">Gerar Pauta de Hoje</strong> para a IA criar 3 Stories e 1 Post sozinha, ou{' '}
              <strong className="text-foreground">fale no microfone / mande uma foto</strong> de uma promoção do dia.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onGenerateDaily}
            className="w-full text-xs font-semibold h-8 rounded-lg"
          >
            <Mic className="w-3.5 h-3.5 mr-1.5 text-primary" />
            Testar Pauta de Hoje
          </Button>
        </div>

        {/* Passo 3 */}
        <div className="rounded-xl border border-border bg-background p-4 flex flex-col justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                3
              </span>
              <span className="text-xs font-bold text-foreground">Aprove no WhatsApp ou Painel</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Você recebe o resumo no seu WhatsApp pela manhã. Gostou? Clique em{' '}
              <strong className="text-foreground">Aprovar e Publicar</strong> e vai direto pro Instagram da sua empresa!
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setExpanded(false);
              onDismissTutorial();
            }}
            className="w-full text-xs font-bold h-8 rounded-lg bg-primary text-primary-foreground"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Entendi, ocultar guia
          </Button>
        </div>
      </div>
    </section>
  );
}
