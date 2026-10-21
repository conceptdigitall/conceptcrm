'use client';

import { toast } from 'sonner';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Megaphone,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AdCampaignPlan, AdCopyVariation } from '@/lib/marketing/ads-squad';

interface AdsAgentCardsProps {
  plan: AdCampaignPlan;
}

function copyToClipboard(text: string, label: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência!`);
  }
}

export function AdsAgentCards({ plan }: AdsAgentCardsProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Barra da Equipe de 5 Agentes IA */}
      <section aria-label="Equipe de 5 Agentes de Tráfego IA" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {plan.agents.map((ag, idx) => (
          <div
            key={ag.id}
            className="rounded-xl border border-border bg-card p-3.5 flex flex-col justify-between gap-2 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary text-primary-foreground text-xs font-bold">
                0{idx + 1}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-primary/30 bg-primary/5 text-primary truncate max-w-[140px]"
              >
                {ag.badge}
              </Badge>
            </div>
            <div>
              <h3 className="text-xs font-bold text-foreground leading-snug">{ag.name}</h3>
              <p className="text-[11px] font-medium text-primary/80">{ag.role}</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
              {ag.summary}
            </p>
          </div>
        ))}
      </section>

      {/* Guia Visual de 3 Cliques para Leigos */}
      <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 md:p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">
              Guia Rápido em 3 Cliques (Sem complicação técnica)
            </h3>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#FCE026] text-slate-950">
            Modo Consultor + Criador Assistido
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {plan.activationSteps.map((st) => (
            <div
              key={st.step}
              className="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-1.5"
            >
              <span className="text-xs font-bold text-primary">{st.title}</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{st.instruction}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 Variações de Anúncio Geradas pelo Agente 2 + Auditadas pela Laya (Agente 3) */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              3 Anúncios Prontos & Auditados (Copywriter + Laya + Link Rastreado)
            </h3>
            <p className="text-xs text-muted-foreground">
              Cada variação atinge uma motivação diferente do cliente e já vem com link de WhatsApp personalizado.
            </p>
          </div>
          <a
            href="https://adsmanager.facebook.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            Abrir Gerenciador da Meta
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {plan.copies.map((copy: AdCopyVariation) => {
            const isApproved = copy.policyAudit.verdict === 'aprovado';
            return (
              <div
                key={copy.id}
                className="rounded-2xl border border-border bg-card p-4 flex flex-col justify-between gap-4 shadow-sm"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
                    <span className="text-xs font-bold text-foreground">{copy.angleLabel}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isApproved
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-700 border border-amber-500/30'
                      }`}
                    >
                      {isApproved ? (
                        <ShieldCheck className="w-3 h-3" />
                      ) : (
                        <ShieldAlert className="w-3 h-3" />
                      )}
                      Laya {copy.policyAudit.score}%
                    </span>
                  </div>

                  <div className="rounded-xl bg-muted/60 border border-border p-3 text-xs text-foreground whitespace-pre-line leading-relaxed">
                    {copy.primaryText}
                  </div>

                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">Título do Botão:</span>
                      <span className="font-bold text-foreground">{copy.headline}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">CTA Meta:</span>
                      <span className="font-semibold text-primary">{copy.ctaButton}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dashed border-border p-2.5 bg-background flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <Target className="w-3 h-3 text-primary" />
                      Direção de Criativo (Vídeo/Foto)
                    </span>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {copy.creativeDirection}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    onClick={() => copyToClipboard(copy.primaryText, copy.angleLabel)}
                    className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs h-9 rounded-xl gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Texto do Anúncio
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(copy.whatsappTrackedUrl, 'Link rastreado do WhatsApp')
                    }
                    className="w-full border-border bg-muted/50 hover:bg-muted text-foreground text-xs h-9 rounded-xl gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Copiar Link WhatsApp Rastreado
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
