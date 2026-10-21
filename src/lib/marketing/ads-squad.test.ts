import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/marketing/content';
import {
  analyzeTrafficHealth,
  auditMetaAdPolicy,
  buildConversionAdCopies,
  buildLocalMediaBuyerStrategy,
  buildTrackingEngineerSpec,
  generateAdCampaignPlan,
} from '@/lib/marketing/ads-squad';
import type { MarketingSettings } from '@/types';

const mockSettings: MarketingSettings = {
  ...DEFAULT_SETTINGS,
  account_id: 'acc-1',
  business_name: 'Barbearia do Alemão',
  business_niche: 'barbearia',
  approver_whatsapp: '13991234567',
};

describe('Concept Autopilot — Squad de Tráfego Pago com IA (5 Agentes)', () => {
  it('Agente 1 (Estrategista Local): define raio e orçamento por nicho com projeção de WhatsApp', () => {
    const strategy = buildLocalMediaBuyerStrategy({
      niche: 'barbearia',
      dailyBudgetBrl: 25,
    });

    expect(strategy.radiusKm).toBe(4);
    expect(strategy.dailyBudgetBrl).toBe(25);
    expect(strategy.monthlyProjectionBrl).toBe(750);
    expect(strategy.estimatedDailyWhatsAppLeads[0]).toBeGreaterThanOrEqual(2);
    expect(strategy.placements).toContain('Instagram Reels (9:16)');
  });

  it('Agente 2 (Copywriter) + 1-Click Post-to-Ad: transforma um post/vídeo em 3 variações de anúncio com link wa.me', () => {
    const copies = buildConversionAdCopies({
      settings: mockSettings,
      post: {
        id: 'post-99',
        title: 'Degradê na régua + toalha quente',
        idea: 'Agende pelo WhatsApp sem fila nesta sexta-feira.',
        caption: 'Legenda original',
        media_type: 'video',
      },
    });

    expect(copies).toHaveLength(3);
    expect(copies[0].primaryText).toContain('Barbearia do Alemão');
    expect(copies[0].primaryText).toContain('Degradê na régua + toalha quente');
    expect(copies[0].whatsappTrackedUrl).toContain('https://wa.me/5513991234567?text=');
    expect(copies[0].creativeDirection).toContain('Vídeo/Reels');
    expect(copies[0].policyAudit.verdict).toBe('aprovado');
  });

  it('Agente 3 (Laya Auditora Meta Ads): aprova copy limpa e sinaliza termos de bloqueio', () => {
    const cleanAudit = auditMetaAdPolicy(
      'Agende seu horário pelo WhatsApp com atendimento pontual e equipe especializada.',
    );
    expect(cleanAudit.score).toBe(100);
    expect(cleanAudit.verdict).toBe('aprovado');
    expect(cleanAudit.flaggedTerms).toHaveLength(0);

    const riskyAudit = auditMetaAdPolicy(
      'Resultado 100% garantido! Veja o antes e depois e fique rico em 7 dias.',
    );
    expect(riskyAudit.verdict).toBe('risco_bloqueio');
    expect(riskyAudit.score).toBeLessThan(50);
    expect(riskyAudit.flaggedTerms.length).toBeGreaterThanOrEqual(2);
    expect(riskyAudit.safeRewrite).not.toContain('100% garantido');
  });

  it('Agente 4 (Engenheiro de Tracking): gera UTM padronizada do Concept Autopilot e eventos CAPI', () => {
    const tracking = buildTrackingEngineerSpec(mockSettings, 'Promo Corte & Barba');
    expect(tracking.utmCampaign).toBe('concept_autopilot_promo_corte_barba');
    expect(tracking.utmQueryString).toContain('utm_source=meta_ads');
    expect(tracking.whatsappBasePhone).toBe('5513991234567');
    expect(tracking.recommendedEvents.map((e) => e.event)).toEqual(['Contact', 'Lead', 'Schedule']);
  });

  it('Agente 5 (Analista de ROI): protege contra pausa precoce (<3 dias) e diagnostica gargalo de WhatsApp vs escala', () => {
    const learning = analyzeTrafficHealth({
      spendBrl: 40,
      clicks: 35,
      whatsappConversations: 5,
      salesCount: 0,
      averageTicketBrl: 70,
      daysRunning: 1,
    });
    expect(learning.status).toBe('aprendizado');
    expect(learning.antiMistakeAlert).toContain('1º ou 2º dia');

    const scale = analyzeTrafficHealth({
      spendBrl: 150,
      clicks: 180,
      whatsappConversations: 25,
      salesCount: 10,
      averageTicketBrl: 65,
      daysRunning: 7,
    });
    expect(scale.status).toBe('escalar');
    expect(scale.roas).toBeGreaterThan(4);

    const commercialBottleneck = analyzeTrafficHealth({
      spendBrl: 120,
      clicks: 110,
      whatsappConversations: 12,
      salesCount: 0,
      averageTicketBrl: 100,
      daysRunning: 5,
    });
    expect(commercialBottleneck.status).toBe('otimizar_atendimento');
  });

  it('Orquestrador generateAdCampaignPlan: retorna suíte Concept Autopilot com os 5 agentes e guia de 3 cliques', () => {
    const plan = generateAdCampaignPlan({
      settings: mockSettings,
      dailyBudgetBrl: 30,
      radiusKm: 5,
    });

    expect(plan.productSuiteName).toBe('Concept Autopilot');
    expect(plan.agents).toHaveLength(5);
    expect(plan.activationSteps).toHaveLength(3);
    expect(plan.strategy.dailyBudgetBrl).toBe(30);
    expect(plan.strategy.radiusKm).toBe(5);
  });
});
