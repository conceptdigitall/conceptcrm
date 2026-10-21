import type { BusinessNiche, MarketingPost, MarketingSettings } from '@/types';
import { getNichePreset } from '@/lib/marketing/niche-autopilot';
import {
  analyzeTrafficHealth,
  auditMetaAdPolicy,
  buildLayaLeadTriageSpec,
  type AdPolicyAudit,
  type AdPolicyVerdict,
  type LayaTriageSpec,
  type PolicyFlag,
  type TrafficHealthDiagnosis,
  type TrafficHealthStatus,
  type TrafficMetricsInput,
} from '@/lib/marketing/ads-analytics-policy';

export {
  analyzeTrafficHealth,
  auditMetaAdPolicy,
  buildLayaLeadTriageSpec,
  type AdPolicyAudit,
  type AdPolicyVerdict,
  type LayaTriageSpec,
  type PolicyFlag,
  type TrafficHealthDiagnosis,
  type TrafficHealthStatus,
  type TrafficMetricsInput,
};

export type AdObjective = 'whatsapp_messages' | 'landing_page_traffic';
export type AdAngle = 'dor_urgente' | 'prova_social' | 'oferta_direta';

export interface AdAgentSummary {
  id: 'estrategista' | 'copywriter' | 'laya_auditora' | 'tracking_capi' | 'analista_roi';
  name: string;
  role: string;
  badge: string;
  summary: string;
}

export interface LocalMediaStrategy {
  objective: AdObjective;
  objectiveLabel: string;
  radiusKm: number;
  ageRange: string;
  dailyBudgetBrl: number;
  monthlyProjectionBrl: number;
  placements: string[];
  audienceHint: string;
  estimatedDailyClicks: [number, number];
  estimatedDailyWhatsAppLeads: [number, number];
}

export interface AdCopyVariation {
  id: string;
  angle: AdAngle;
  angleLabel: string;
  hook: string;
  primaryText: string;
  headline: string;
  ctaButton: string;
  whatsappGreeting: string;
  whatsappTrackedUrl: string;
  creativeDirection: string;
  policyAudit: AdPolicyAudit;
}

export interface TrackingEngineerSpec {
  utmCampaign: string;
  utmQueryString: string;
  whatsappBasePhone: string;
  recommendedEvents: { event: string; trigger: string }[];
  checklist: string[];
}

export interface AdQuickActivationStep {
  step: number;
  title: string;
  instruction: string;
}

export interface AdCampaignPlan {
  productSuiteName: 'Concept Autopilot';
  campaignName: string;
  sourcePostId: string | null;
  sourcePostTitle: string | null;
  niche: BusinessNiche;
  agents: AdAgentSummary[];
  strategy: LocalMediaStrategy;
  copies: AdCopyVariation[];
  layaTriage: LayaTriageSpec;
  tracking: TrackingEngineerSpec;
  diagnosis: TrafficHealthDiagnosis;
  activationSteps: AdQuickActivationStep[];
}

const NICHE_RADIUS_DEFAULTS: Record<BusinessNiche, { radiusKm: number; ageRange: string; ticketBrl: number; audienceHint: string }> = {
  barbearia: { radiusKm: 4, ageRange: '18 a 48 anos (Masculino)', ticketBrl: 65, audienceHint: 'Moradores ou trabalhadores num raio de 4 km do endereço físico.' },
  clinica: { radiusKm: 6, ageRange: '25 a 60 anos (Todos)', ticketBrl: 350, audienceHint: 'Famílias e adultos na cidade/região buscando atendimento rápido sem fila.' },
  adega: { radiusKm: 3, ageRange: '21 a 45 anos (Todos)', ticketBrl: 95, audienceHint: 'Raio curto de entrega rápida (3 km) focado em quinta a domingo.' },
  estetica: { radiusKm: 5, ageRange: '22 a 55 anos (Feminino/Todos)', ticketBrl: 180, audienceHint: 'Raio de 5 km com interesse em autocuidado, beleza e bem-estar.' },
  advocacia: { radiusKm: 7, ageRange: '28 a 62 anos (Todos)', ticketBrl: 1200, audienceHint: 'Empresários e trabalhadores na comarca/região metropolitana.' },
  comercio: { radiusKm: 5, ageRange: '20 a 55 anos (Todos)', ticketBrl: 140, audienceHint: 'Compradores locais próximos à loja ou na rota de entrega expressa.' },
  agencia: { radiusKm: 7, ageRange: '25 a 55 anos (Donos de Negócio)', ticketBrl: 2500, audienceHint: 'Empresários locais, clínicas e comércios que anunciam ou usam WhatsApp.' },
  geral: { radiusKm: 5, ageRange: '22 a 55 anos (Todos)', ticketBrl: 150, audienceHint: 'Público local no raio de atendimento da sua empresa.' },
};

export function buildLocalMediaBuyerStrategy(input: {
  niche: BusinessNiche;
  dailyBudgetBrl?: number;
  radiusKm?: number;
  objective?: AdObjective;
}): LocalMediaStrategy {
  const cfg = NICHE_RADIUS_DEFAULTS[input.niche] ?? NICHE_RADIUS_DEFAULTS.geral;
  const dailyBudgetBrl = Math.max(10, input.dailyBudgetBrl ?? 20);
  const radiusKm = Math.max(1, Math.min(30, input.radiusKm ?? cfg.radiusKm));
  const objective: AdObjective = input.objective ?? 'whatsapp_messages';

  const minClicks = Math.max(6, Math.round(dailyBudgetBrl * 0.9));
  const maxClicks = Math.max(12, Math.round(dailyBudgetBrl * 1.8));
  const minLeads = Math.max(2, Math.round(dailyBudgetBrl / 8));
  const maxLeads = Math.max(4, Math.round(dailyBudgetBrl / 4));

  return {
    objective,
    objectiveLabel:
      objective === 'whatsapp_messages'
        ? 'Engajamento → Conversas Diretas no WhatsApp'
        : 'Tráfego / Conversão → Landing Page + WhatsApp',
    radiusKm,
    ageRange: cfg.ageRange,
    dailyBudgetBrl,
    monthlyProjectionBrl: dailyBudgetBrl * 30,
    placements: ['Instagram Reels (9:16)', 'Instagram Stories (9:16)', 'Feed Local (4:5)'],
    audienceHint: cfg.audienceHint,
    estimatedDailyClicks: [minClicks, maxClicks],
    estimatedDailyWhatsAppLeads: [minLeads, maxLeads],
  };
}

function buildTrackedWhatsAppUrl(phoneRaw: string | null | undefined, greeting: string): string {
  const digits = (phoneRaw || '').replace(/\D/g, '');
  const normalized = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '5513999999999';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(greeting)}`;
}

export function buildConversionAdCopies(input: {
  settings: MarketingSettings;
  post?: Pick<MarketingPost, 'id' | 'title' | 'idea' | 'caption' | 'media_type'> | null;
  customOffer?: string;
}): AdCopyVariation[] {
  const niche = input.settings.business_niche ?? 'geral';
  const preset = getNichePreset(niche);
  const businessName = input.settings.business_name?.trim() || 'Nossa Equipe';
  const baseTopic = input.customOffer?.trim() || input.post?.title?.trim() || preset.dailyFeed.title;
  const baseDetail = input.post?.idea?.trim() || preset.dailyFeed.idea;

  const rawVariations: Omit<AdCopyVariation, 'whatsappTrackedUrl' | 'policyAudit'>[] = [
    {
      id: 'ad-dor-urgente',
      angle: 'dor_urgente',
      angleLabel: 'Ângulo 1 · Dor & Solução Rápida',
      hook: `Cansado de esperar ou perder tempo quando precisa de ${preset.label.toLowerCase()}?`,
      primaryText: `Cansado de esperar ou perder tempo quando precisa de ${preset.label.toLowerCase()}?\n\nEm ${businessName}, você resolve tudo pelo celular em segundos: ${baseTopic}.\n\n${baseDetail}\n\nToque em "Enviar mensagem" e fale direto no nosso WhatsApp agora.`,
      headline: `${businessName} · Atendimento Rápido no WhatsApp`,
      ctaButton: 'Enviar mensagem pelo WhatsApp',
      whatsappGreeting: `Olá! Vi o anúncio sobre "${baseTopic}" no Instagram e quero saber os horários/valores disponíveis.`,
      creativeDirection: input.post?.media_type === 'video'
        ? 'Usar o Vídeo/Reels selecionado com legenda grande nos primeiros 3 segundos.'
        : 'Vídeo curto (15–25s) mostrando o atendimento rápido na prática + chamada para o WhatsApp.',
    },
    {
      id: 'ad-prova-social',
      angle: 'prova_social',
      angleLabel: 'Ângulo 2 · Autoridade & Confiança Local',
      hook: `Por que tantos clientes da região escolhem ${businessName}?`,
      primaryText: `Por que tantos clientes da região escolhem ${businessName}?\n\nDestaque da semana: ${baseTopic}.\n${baseDetail}\n\nAtendimento com hora marcada, transparência e resposta imediata no WhatsApp.`,
      headline: `Qualidade e Agilidade · Chame no WhatsApp`,
      ctaButton: 'Falar no WhatsApp',
      whatsappGreeting: `Olá! Vi o destaque de ${businessName} no Instagram e gostaria de atendimento.`,
      creativeDirection: 'Mostrar bastidores reais, ambiente ou resultado impecável com selo de localização da cidade.',
    },
    {
      id: 'ad-oferta-direta',
      angle: 'oferta_direta',
      angleLabel: 'Ângulo 3 · Convite Direto (Fundo de Funil)',
      hook: `Agenda e atendimento liberados para hoje em ${businessName}!`,
      primaryText: `Agenda e atendimento liberados em ${businessName}: ${baseTopic}.\n\nSem burocracia e sem fila de espera. Clique no botão abaixo e garanta seu atendimento pelo WhatsApp em menos de 1 minuto.`,
      headline: `Garanta seu Atendimento Hoje`,
      ctaButton: 'Agendar pelo WhatsApp',
      whatsappGreeting: `Olá! Quero aproveitar a condição/horário do anúncio "${baseTopic}".`,
      creativeDirection: 'Card ou vídeo direto ao ponto com o benefício principal em amarelo/destaque e seta para o botão.',
    },
  ];

  return rawVariations.map((v) => ({
    ...v,
    whatsappTrackedUrl: buildTrackedWhatsAppUrl(input.settings.approver_whatsapp, v.whatsappGreeting),
    policyAudit: auditMetaAdPolicy(v.primaryText),
  }));
}

export function buildTrackingEngineerSpec(
  settings: MarketingSettings,
  campaignSlug: string,
): TrackingEngineerSpec {
  const utmCampaign = `concept_autopilot_${campaignSlug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'local'}`;
  const utmQueryString = `?utm_source=meta_ads&utm_medium=cpc&utm_campaign=${utmCampaign}&utm_content=whatsapp_cta`;
  const digits = (settings.approver_whatsapp || '').replace(/\D/g, '');
  const whatsappBasePhone = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '5513999999999';

  return {
    utmCampaign,
    utmQueryString,
    whatsappBasePhone,
    recommendedEvents: [
      { event: 'Contact', trigger: 'Dispara quando o lead clica no botão de WhatsApp da Landing Page ou Anúncio.' },
      { event: 'Lead', trigger: 'Dispara quando a Recepcionista de IA registra a 1ª mensagem no CRM Concept.' },
      { event: 'Schedule', trigger: 'Dispara quando o agendamento/pedido é confirmado no CRM.' },
    ],
    checklist: [
      'Saudação personalizada no link wa.me para o CRM identificar o anúncio de origem',
      'Parâmetros UTM configurados para rastrear cliques no painel',
      'Recepcionista de IA ativa para responder em menos de 5 segundos (24/7)',
    ],
  };
}

export function generateAdCampaignPlan(input: {
  settings: MarketingSettings;
  post?: Pick<MarketingPost, 'id' | 'title' | 'idea' | 'caption' | 'media_type'> | null;
  dailyBudgetBrl?: number;
  radiusKm?: number;
  objective?: AdObjective;
  customOffer?: string;
  metrics?: Partial<TrafficMetricsInput>;
}): AdCampaignPlan {
  const niche = input.settings.business_niche ?? 'geral';
  const preset = getNichePreset(niche);
  const cfg = NICHE_RADIUS_DEFAULTS[niche] ?? NICHE_RADIUS_DEFAULTS.geral;

  const strategy = buildLocalMediaBuyerStrategy({
    niche,
    dailyBudgetBrl: input.dailyBudgetBrl,
    radiusKm: input.radiusKm,
    objective: input.objective,
  });

  const copies = buildConversionAdCopies({
    settings: input.settings,
    post: input.post,
    customOffer: input.customOffer,
  });

  const layaTriage = buildLayaLeadTriageSpec();
  const baseTitle = input.customOffer?.trim() || input.post?.title?.trim() || preset.dailyFeed.title;
  const tracking = buildTrackingEngineerSpec(input.settings, baseTitle);

  const defaultSpend = strategy.dailyBudgetBrl * 7;
  const defaultConvs = Math.max(8, Math.round(defaultSpend / 7));
  const defaultSales = Math.max(2, Math.round(defaultConvs * 0.25));
  const diagnosis = analyzeTrafficHealth({
    spendBrl: input.metrics?.spendBrl ?? defaultSpend,
    clicks: input.metrics?.clicks ?? defaultConvs * 3,
    whatsappConversations: input.metrics?.whatsappConversations ?? defaultConvs,
    salesCount: input.metrics?.salesCount ?? defaultSales,
    averageTicketBrl: input.metrics?.averageTicketBrl ?? cfg.ticketBrl,
    daysRunning: input.metrics?.daysRunning ?? 7,
  });

  const agents: AdAgentSummary[] = [
    {
      id: 'estrategista',
      name: 'Agente 1 · Estrategista Local',
      role: 'Media Buyer de Raio',
      badge: `Raio ${strategy.radiusKm}km · R$ ${strategy.dailyBudgetBrl}/dia`,
      summary: `Configurou campanha local (${strategy.ageRange}) focada em ${strategy.objectiveLabel}.`,
    },
    {
      id: 'copywriter',
      name: 'Agente 2 · Copywriter de Conversão',
      role: 'Especialista em Retenção',
      badge: `${copies.length} Ângulos Prontos`,
      summary: 'Gerou 3 variações persuasivas (Dor, Prova Social e Oferta Direta) com link rastreado.',
    },
    {
      id: 'laya_auditora',
      name: 'Agente 3 · Laya Auditora & Triagem',
      role: 'Blindagem Meta + Qualificação',
      badge: `Score ${copies[0]?.policyAudit.score ?? 100}% Seguro`,
      summary: 'Auditou os textos contra bloqueios da Meta e preparou a triagem de leads no WhatsApp.',
    },
    {
      id: 'tracking_capi',
      name: 'Agente 4 · Engenheiro de Tracking',
      role: 'Pixel, CAPI & UTMs',
      badge: 'Rastreio Ativo',
      summary: `Criou saudação rastreável no WhatsApp e UTMs (${tracking.utmCampaign}).`,
    },
    {
      id: 'analista_roi',
      name: 'Agente 5 · Analista de ROI',
      role: 'Guardião de Lucro & CAC',
      badge: `ROAS Est. ${diagnosis.roas}x`,
      summary: diagnosis.headlineVerdict,
    },
  ];

  const activationSteps: AdQuickActivationStep[] = [
    {
      step: 1,
      title: '1º Clique · Copiar Anúncio Auditado',
      instruction: 'Escolha um dos 3 ângulos abaixo e clique em "Copiar Copy + Link WhatsApp". Use o vídeo/post da aba Marketing como criativo.',
    },
    {
      step: 2,
      title: '2º Clique · Definir Raio Local e Verba',
      instruction: `No Gerenciador da Meta (ou botão Turbinar para WhatsApp), selecione o raio de ${strategy.radiusKm} km ao redor do seu endereço e R$ ${strategy.dailyBudgetBrl}/dia.`,
    },
    {
      step: 3,
      title: '3º Clique · Ativar e Deixar a IA Atender',
      instruction: 'Publique o anúncio. Assim que o cliente clicar, ele cai no WhatsApp com a mensagem rastreada e a Recepcionista de IA + Laya assumem o atendimento!',
    },
  ];

  return {
    productSuiteName: 'Concept Autopilot',
    campaignName: `[Concept Autopilot] ${preset.label} — ${baseTitle}`,
    sourcePostId: input.post?.id ?? null,
    sourcePostTitle: input.post?.title ?? null,
    niche,
    agents,
    strategy,
    copies,
    layaTriage,
    tracking,
    diagnosis,
    activationSteps,
  };
}
