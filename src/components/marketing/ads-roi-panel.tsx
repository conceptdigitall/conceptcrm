'use client';

import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Check,
  Copy,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  AdCampaignPlan,
  TrafficHealthDiagnosis,
} from '@/lib/marketing/ads-squad';

interface AdsRoiPanelProps {
  plan: AdCampaignPlan;
  liveDiagnosis: TrafficHealthDiagnosis;
  spendBrl: number;
  whatsappConvs: number;
  salesCount: number;
  ticketBrl: number;
  daysRunning: number;
  onChangeSpend: (v: number) => void;
  onChangeConvs: (v: number) => void;
  onChangeSales: (v: number) => void;
  onChangeTicket: (v: number) => void;
  onChangeDays: (v: number) => void;
}

export function AdsRoiPanel({
  plan,
  liveDiagnosis,
  spendBrl,
  whatsappConvs,
  salesCount,
  ticketBrl,
  daysRunning,
  onChangeSpend,
  onChangeConvs,
  onChangeSales,
  onChangeTicket,
  onChangeDays,
}: AdsRoiPanelProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Agente 5: Diagnóstico de Saúde do Tráfego para Leigos */}
      <section className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Agente 5 · Analista de ROI & Saúde do Tráfego (Linguagem Simples)
            </h3>
            <p className="text-xs text-muted-foreground">
              Informe os números da sua campanha para receber o veredito da IA sem sopa de letrinhas.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/25">
            {liveDiagnosis.statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground font-medium">Investido (R$)</span>
            <input
              type="number"
              min={0}
              value={spendBrl}
              onChange={(e) => onChangeSpend(Number(e.target.value))}
              className="h-9 rounded-lg border border-border bg-background px-2.5 font-bold text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground font-medium">Conversas Whats</span>
            <input
              type="number"
              min={0}
              value={whatsappConvs}
              onChange={(e) => onChangeConvs(Number(e.target.value))}
              className="h-9 rounded-lg border border-border bg-background px-2.5 font-bold text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground font-medium">Vendas no CRM</span>
            <input
              type="number"
              min={0}
              value={salesCount}
              onChange={(e) => onChangeSales(Number(e.target.value))}
              className="h-9 rounded-lg border border-border bg-background px-2.5 font-bold text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground font-medium">Ticket Médio (R$)</span>
            <input
              type="number"
              min={0}
              value={ticketBrl}
              onChange={(e) => onChangeTicket(Number(e.target.value))}
              className="h-9 rounded-lg border border-border bg-background px-2.5 font-bold text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground font-medium">Dias no Ar</span>
            <input
              type="number"
              min={1}
              value={daysRunning}
              onChange={(e) => onChangeDays(Number(e.target.value))}
              className="h-9 rounded-lg border border-border bg-background px-2.5 font-bold text-foreground"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="rounded-xl bg-muted/50 border border-border p-3">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Custo por Conversa
            </span>
            <span className="text-base font-bold text-foreground">
              R$ {liveDiagnosis.cplBrl.toFixed(2)}
            </span>
          </div>
          <div className="rounded-xl bg-muted/50 border border-border p-3">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Custo por Venda (CAC)
            </span>
            <span className="text-base font-bold text-foreground">
              R$ {liveDiagnosis.cacBrl.toFixed(2)}
            </span>
          </div>
          <div className="rounded-xl bg-muted/50 border border-border p-3">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Retorno Bruto
            </span>
            <span className="text-base font-bold text-emerald-600">
              R$ {liveDiagnosis.revenueBrl.toFixed(2)}
            </span>
          </div>
          <div className="rounded-xl bg-primary/10 border border-primary/30 p-3">
            <span className="text-[10px] uppercase font-bold text-primary block">
              Multiplicador (ROAS)
            </span>
            <span className="text-base font-bold text-primary">{liveDiagnosis.roas}x</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <TrendingUp className="w-4 h-4 text-primary" />
            Diagnóstico: {liveDiagnosis.headlineVerdict}
          </div>
          <p className="text-xs text-muted-foreground">
            <b className="text-foreground">Ação recomendada:</b> {liveDiagnosis.actionRecommendation}
          </p>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-700 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 mt-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{liveDiagnosis.antiMistakeAlert}</span>
          </div>
        </div>
      </section>

      {/* Agentes 3 e 4: Rastreamento UTM + Triagem Laya no WhatsApp */}
      <section className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <RefreshCw className="w-4 h-4 text-primary" />
            Agentes 3 & 4 · Rastreio + Triagem Laya
          </h3>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-muted-foreground uppercase">
              Parâmetro UTM (Para Landing Page)
            </span>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-muted p-2 text-[11px] text-foreground truncate border border-border">
                {plan.tracking.utmQueryString}
              </code>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(plan.tracking.utmQueryString);
                  toast.success('UTM copiada!');
                }}
                className="h-8 px-2.5 text-xs"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase">
              Triagem Automática Laya no WhatsApp
            </span>
            {plan.layaTriage.questions.map((q) => (
              <div
                key={q.kind}
                className="rounded-xl border border-border bg-background p-2.5 flex flex-col gap-0.5"
              >
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  {q.label}
                </span>
                <span className="text-[11px] text-muted-foreground">{q.rule}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-[11px] text-muted-foreground">
          <b className="text-foreground">Fluxo Fechado Concept Autopilot:</b> Post/Vídeo → Anúncio de Raio → Clique para WhatsApp → Recepcionista IA responde em 4s → Laya classifica no CRM.
        </div>
      </section>
    </div>
  );
}
