import { describe, expect, it } from 'vitest';
import type { Lead, LeadColumnValue } from '@/types';
import {
  compareRanked,
  rankLeads,
  extractDistinctRegions,
  getLeadAudience,
  extractAudienceList,
  calculateClosingProbability,
} from './dynamic-search';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    account_id: 'acc-1',
    search_id: 'search-1',
    name: 'Barbearia do Alemão',
    category: 'Barbearia',
    phone: '13999998888',
    is_mobile: true,
    website: null,
    rating: 4.8,
    review_count: 120,
    address: 'Av. Brasil, 100 - Gonzaga, Santos',
    place_id: null,
    contact_id: null,
    email: null,
    maps_url: null,
    raw: null,
    score: 80,
    score_reasons: ['Celular detectado', 'Avaliações consistentes'],
    status: 'novo',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

describe('dynamic-search', () => {
  describe('extractDistinctRegions', () => {
    it('extrai cidades e bairros do raw.complete_address e do address', () => {
      const leads: Lead[] = [
        makeLead({
          id: '1',
          raw: { complete_address: { borough: 'Gonzaga', city: 'Santos' } },
        }),
        makeLead({
          id: '2',
          raw: { complete_address: { city: 'Cubatão' } },
        }),
        makeLead({
          id: '3',
          raw: null,
          address: 'Rua das Flores, 50 - Centro, Praia Grande',
        }),
      ];

      const regions = extractDistinctRegions(leads);
      expect(regions).toContain('Gonzaga, Santos');
      expect(regions).toContain('Cubatão');
      expect(regions).toContain('Centro, Praia Grande');
    });
  });

  describe('getLeadAudience', () => {
    it('identifica nichos de saúde, beleza, alimentação e serviços', () => {
      expect(getLeadAudience(makeLead({ category: 'Clínica Odontológica' }))).toBe('Saúde & Clínicas');
      expect(getLeadAudience(makeLead({ category: 'Barbearia Retrô' }))).toBe('Beleza & Bem-Estar');
      expect(getLeadAudience(makeLead({ category: 'Restaurante e Adega' }))).toBe('Alimentação & Bares');
      expect(getLeadAudience(makeLead({ category: 'Oficina Mecânica' }))).toBe('Serviços & Reparos');
      expect(getLeadAudience(makeLead({ category: 'Metalúrgica Industrial' }))).toBe('Outros Negócios');
    });

    it('extrai grupos únicos com extractAudienceList', () => {
      const leads = [
        makeLead({ id: '1', category: 'Clínica' }),
        makeLead({ id: '2', category: 'Barbearia' }),
        makeLead({ id: '3', category: 'Salão de Beleza' }),
      ];
      const list = extractAudienceList(leads);
      expect(list).toEqual(['Beleza & Bem-Estar', 'Saúde & Clínicas']);
    });
  });

  describe('calculateClosingProbability', () => {
    it('calcula alta probabilidade quando Laya e colunas IA indicam alto potencial', () => {
      const lead = makeLead({
        rating: 4.5,
        review_count: 80,
        website: null,
        is_mobile: true,
      });

      const columnValues: LeadColumnValue[] = [
        {
          column_id: 'col-1',
          lead_id: lead.id,
          account_id: lead.account_id,
          value: 'alto',
          confidence: 0.95,
          corrected_value: null,
          corrected_by: null,
          corrected_at: null,
          updated_at: '2026-10-01T00:00:00Z',
        },
      ];

      const res = calculateClosingProbability(lead, {
        query: 'recepcionista de ia para atendimento',
        layaScore: 0.85,
        columnValues,
      });

      expect(res.probability).toBeGreaterThanOrEqual(70);
      expect(res.probabilityLevel).toBe('alta');
      expect(res.reasons.length).toBeGreaterThan(0);
    });

    it('penaliza leads sem telefone ou sem afinidade', () => {
      const lead = makeLead({
        phone: null,
        is_mobile: false,
        website: 'https://grande-empresa.com.br',
      });

      const res = calculateClosingProbability(lead, {
        layaScore: 0.1,
      });

      expect(res.probability).toBeLessThan(45);
      expect(res.probabilityLevel).toBe('baixa');
      expect(res.reasons).toContain('Sem telefone de contato');
    });
  });
});

describe('rankLeads + compareRanked', () => {
  const mk = (id: string, over: Partial<Lead> = {}): Lead =>
    ({
      id, name: `Negócio ${id}`, category: 'Barbearia', address: 'Gonzaga, Santos', phone: '5513991234567',
      is_mobile: true, website: null, rating: 4.8, review_count: 120, score: 50, score_reasons: [], status: 'novo',
      raw: null, ...over,
    }) as Lead;

  it('puts leads whose name matches the query first', () => {
    const leads = [mk('a'), mk('b', { name: 'Barbearia Rodrigues' }), mk('c')];
    const ranked = rankLeads(leads, 'rodrigues', new Map());
    const order = [...leads].sort((x, y) => compareRanked(ranked.get(x.id), ranked.get(y.id))).map((l) => l.id);
    expect(order[0]).toBe('b');
    expect(ranked.get('b')?.textMatch).toBe(true);
  });

  it('orders by probability when nothing matches by name', () => {
    const leads = [mk('a', { phone: null }), mk('b')];
    const ranked = rankLeads(leads, 'recepcionista de IA', new Map());
    const order = [...leads].sort((x, y) => compareRanked(ranked.get(x.id), ranked.get(y.id))).map((l) => l.id);
    expect(order).toEqual(['b', 'a']);
  });

  it('uses the Laya answer when there is one for the lead', () => {
    const laya = new Map([['a', { leadId: 'a', probability: 91, probabilityLevel: 'alta' as const, reasons: ['Laya'] }]]);
    const ranked = rankLeads([mk('a'), mk('b')], 'recepcionista', new Map(), laya);
    expect(ranked.get('a')?.result.probability).toBe(91);
    expect(ranked.get('b')?.result.reasons).not.toContain('Laya');
  });
});
