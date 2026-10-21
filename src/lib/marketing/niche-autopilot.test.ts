import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, captionSystemPrompt } from './content';
import {
  BUSINESS_NICHES,
  buildQuickInputDraft,
  buildWhatsAppApprovalMessage,
  generateDailyAutopilotDrafts,
  getNichePreset,
} from './niche-autopilot';

describe('marketing autopilot multi-negócio', () => {
  const baseSettings = {
    ...DEFAULT_SETTINGS,
    account_id: 'acc-1',
    business_name: 'Barbearia do Alemão',
    business_niche: 'barbearia' as const,
  };

  it('retorna o preset correto do nicho ou fallback geral', () => {
    expect(getNichePreset('barbearia').label).toBe('Barbearia');
    expect(getNichePreset('adega').label).toBe('Adega / Gastronomia');
    expect(getNichePreset(undefined).value).toBe('geral');
    expect(BUSINESS_NICHES.length).toBeGreaterThanOrEqual(7);
  });

  it('gera 3 stories e 1 post de feed em modo aprovação manual (pending_approval)', () => {
    const drafts = generateDailyAutopilotDrafts({ ...baseSettings, require_approval: true });
    expect(drafts).toHaveLength(4);
    expect(drafts.filter((d) => d.kind === 'story')).toHaveLength(3);
    expect(drafts.filter((d) => d.kind === 'feed')).toHaveLength(1);
    expect(drafts.every((d) => d.status === 'pending_approval')).toBe(true);
    expect(drafts[0].idea).toContain('[Barbearia do Alemão]');
  });

  it('gera pauta já agendada (scheduled) quando Piloto Automático está ativo (require_approval = false)', () => {
    const drafts = generateDailyAutopilotDrafts({ ...baseSettings, require_approval: false });
    expect(drafts.every((d) => d.status === 'scheduled')).toBe(true);
    expect(drafts.every((d) => Boolean(d.scheduled_at))).toBe(true);
  });

  it('transforma input rápido de áudio/foto em post ou story estruturado', () => {
    const draft = buildQuickInputDraft(
      {
        text: 'Chegou cerveja artesanal IPA trincando por R$ 19,90 neste sábado! Peça no zap.',
        kind: 'story',
        mediaUrl: 'https://cdn.exemplo.com/ipa.jpg',
      },
      { ...baseSettings, require_approval: true },
    );

    expect(draft.kind).toBe('story');
    expect(draft.title).toContain('Chegou cerveja artesanal IPA');
    expect(draft.media_urls).toEqual(['https://cdn.exemplo.com/ipa.jpg']);
    expect(draft.status).toBe('pending_approval');
  });

  it('formata mensagem de aprovação para o WhatsApp do dono', () => {
    const drafts = generateDailyAutopilotDrafts(baseSettings);
    const msg = buildWhatsAppApprovalMessage(drafts, baseSettings, 'https://app.teste/marketing');
    expect(msg).toContain('*Barbearia do Alemão*');
    expect(msg).toContain('3 Stories e 1 Post(s) de Feed');
    expect(msg).toContain('Modo Aprovação');
    expect(msg).toContain('https://app.teste/marketing');
  });

  it('personaliza o prompt de legenda com o nome e ramo do negócio do cliente', () => {
    const prompt = captionSystemPrompt(baseSettings);
    expect(prompt).toContain('Barbearia do Alemão');
    expect(prompt).toContain('barbearia');
  });
});
