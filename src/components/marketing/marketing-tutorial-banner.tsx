'use client';

import { HelpCircle, Rocket, ShieldCheck, Store } from 'lucide-react';

interface MarketingTutorialBannerProps {
  businessName?: string;
  nicheLabel: string;
  requireApproval: boolean;
  onOpenTour: () => void;
  onOpenSettings: () => void;
}

// Linha de status do marketing. O passo a passo virou o tour (marketing-tour.tsx);
// aqui fica só o resumo e o atalho para reabrir o tour.
export function MarketingTutorialBanner({
  businessName,
  nicheLabel,
  requireApproval,
  onOpenTour,
  onOpenSettings,
}: MarketingTutorialBannerProps) {
  const name = businessName?.trim();

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-card/70 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {name ? (
          <span className="inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-primary" />
            <strong className="font-semibold text-foreground">{name}</strong>
            <span>· {nicheLabel}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            <Store className="h-3.5 w-3.5" />
            Configure seu negócio para a IA acertar o tom
          </button>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-medium text-foreground">
          {requireApproval ? <ShieldCheck className="h-3.5 w-3.5 text-primary" /> : <Rocket className="h-3.5 w-3.5 text-primary" />}
          {requireApproval ? 'Você aprova antes' : 'Piloto automático'}
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenTour}
        className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Como funciona?
      </button>
    </div>
  );
}
