'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Bot,
  MapPin,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { MarketingPost, MarketingSettings } from '@/types';
import {
  analyzeTrafficHealth,
  generateAdCampaignPlan,
  type AdObjective,
} from '@/lib/marketing/ads-squad';
import { AdsAgentCards } from '@/components/marketing/ads-agent-cards';
import { AdsRoiPanel } from '@/components/marketing/ads-roi-panel';

interface AdsSquadTabProps {
  settings: MarketingSettings;
  posts: MarketingPost[];
  initialPost?: MarketingPost | null;
  onClearInitialPost?: () => void;
}

const BUDGET_PRESETS = [15, 20, 35, 50];
const RADIUS_PRESETS = [3, 5, 7, 12];

export function AdsSquadTab({
  settings,
  posts,
  initialPost = null,
  onClearInitialPost,
}: AdsSquadTabProps) {
  const [selectedPostId, setSelectedPostId] = useState<string>(initialPost?.id || '');
  const [dailyBudgetBrl, setDailyBudgetBrl] = useState<number>(20);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [objective, setObjective] = useState<AdObjective>('whatsapp_messages');
  const [customOffer, setCustomOffer] = useState<string>('');

  const [spendBrl, setSpendBrl] = useState<number>(140);
  const [whatsappConvs, setWhatsappConvs] = useState<number>(22);
  const [salesCount, setSalesCount] = useState<number>(5);
  const [ticketBrl, setTicketBrl] = useState<number>(120);
  const [daysRunning, setDaysRunning] = useState<number>(7);

  const activePost = useMemo(
    () => posts.find((p) => p.id === selectedPostId) || initialPost || null,
    [posts, selectedPostId, initialPost],
  );

  const plan = useMemo(
    () =>
      generateAdCampaignPlan({
        settings,
        post: activePost,
        dailyBudgetBrl,
        radiusKm,
        objective,
        customOffer,
        metrics: {
          spendBrl,
          whatsappConversations: whatsappConvs,
          salesCount,
          averageTicketBrl: ticketBrl,
          daysRunning,
        },
      }),
    [
      settings,
      activePost,
      dailyBudgetBrl,
      radiusKm,
      objective,
      customOffer,
      spendBrl,
      whatsappConvs,
      salesCount,
      ticketBrl,
      daysRunning,
    ],
  );

  const liveDiagnosis = useMemo(
    () =>
      analyzeTrafficHealth({
        spendBrl,
        clicks: whatsappConvs * 3,
        whatsappConversations: whatsappConvs,
        salesCount,
        averageTicketBrl: ticketBrl,
        daysRunning,
      }),
    [spendBrl, whatsappConvs, salesCount, ticketBrl, daysRunning],
  );

  function handleSelectPost(id: string) {
    setSelectedPostId(id);
    if (!id && onClearInitialPost) {
      onClearInitialPost();
    }
    if (id) {
      toast.success('Post/Vídeo carregado! Os 5 agentes recalcularam o plano de anúncio.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho do Squad de Tráfego Pago com IA */}
      <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-bold">
                <Bot className="w-3.5 h-3.5" />
                Squad de Tráfego Pago IA
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                5 Agentes Ativos · Zero Risco de Bloqueio
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-foreground mt-1">
              {plan.campaignName}
            </h2>
            <p className="text-xs text-muted-foreground">
              Estratégia de Raio Local + Copies Auditadas pela Laya + Rastreio de Conversão no WhatsApp.
            </p>
          </div>

          {/* Projeção ao Vivo do Agente 1 */}
          <div className="flex items-center gap-4 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Cliques / Dia Est.
              </span>
              <span className="text-sm font-bold text-foreground">
                {plan.strategy.estimatedDailyClicks[0]} a {plan.strategy.estimatedDailyClicks[1]}
              </span>
            </div>
            <div className="h-7 w-px bg-border" />
            <div>
              <span className="text-[10px] uppercase font-bold text-primary block">
                Conversas WhatsApp / Dia
              </span>
              <span className="text-sm font-bold text-primary">
                {plan.strategy.estimatedDailyWhatsAppLeads[0]} a {plan.strategy.estimatedDailyWhatsAppLeads[1]} leads/dia
              </span>
            </div>
          </div>
        </div>

        {/* Controles de Comando: Post em 1 Clique, Orçamento, Raio e Oferta */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              Post ou Vídeo de Origem (1 Clique)
            </label>
            <select
              value={selectedPostId}
              onChange={(e) => handleSelectPost(e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Pauta Padrão do Nicho ({settings.business_niche || 'geral'})</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.kind === 'story' ? 'Story' : p.media_type === 'video' ? 'Vídeo/Reels' : 'Feed'}] {p.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground">
              Orçamento Diário (R$ {dailyBudgetBrl}/dia · R$ {plan.strategy.monthlyProjectionBrl}/mês)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {BUDGET_PRESETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setDailyBudgetBrl(b)}
                  className={`h-10 rounded-xl text-xs font-bold border transition-colors ${
                    dailyBudgetBrl === b
                      ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  R$ {b}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Raio Geográfico Local
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {RADIUS_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadiusKm(r)}
                  className={`h-10 rounded-xl text-xs font-bold border transition-colors ${
                    radiusKm === r
                      ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Oferta Específica (Opcional)
            </label>
            <input
              type="text"
              value={customOffer}
              onChange={(e) => setCustomOffer(e.target.value)}
              placeholder="Ex.: Avaliação grátis / Combo Sextou..."
              className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-muted-foreground">Objetivo:</span>
            <button
              type="button"
              onClick={() => setObjective('whatsapp_messages')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                objective === 'whatsapp_messages'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              Mensagens Diretas no WhatsApp (Recomendado)
            </button>
            <button
              type="button"
              onClick={() => setObjective('landing_page_traffic')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                objective === 'landing_page_traffic'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              Tráfego para Landing Page
            </button>
          </div>
          <span className="text-muted-foreground">
            Público sugerido: <b className="text-foreground">{plan.strategy.ageRange}</b> · {plan.strategy.audienceHint}
          </span>
        </div>
      </section>

      <AdsAgentCards plan={plan} />

      <AdsRoiPanel
        plan={plan}
        liveDiagnosis={liveDiagnosis}
        spendBrl={spendBrl}
        whatsappConvs={whatsappConvs}
        salesCount={salesCount}
        ticketBrl={ticketBrl}
        daysRunning={daysRunning}
        onChangeSpend={setSpendBrl}
        onChangeConvs={setWhatsappConvs}
        onChangeSales={setSalesCount}
        onChangeTicket={setTicketBrl}
        onChangeDays={setDaysRunning}
      />
    </div>
  );
}
