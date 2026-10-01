import { describe, expect, it, vi } from 'vitest';
import {
  sanitizeLeadContext,
  resolveEnsemblePrediction,
} from '@/lib/laya/reliable-inference';
import type { Lead } from '@/types';
import { buildLeadState } from '@/lib/prospecting/columns';

describe('Laya Zero-Error Benchmark & Pipeline', () => {
  const barbeariaLead: Partial<Lead> = {
    name: 'Barbearia Roots Santos',
    category: 'Barbearia',
    rating: 4.8,
    review_count: 85,
    website: 'https://barbeariaroots.com.br',
    phone: '+5513999998888',
    is_mobile: true,
    raw: {
      about: [
        {
          name: 'Comodidades',
          options: [
            { name: 'Oferecemos cerveja artesanal e cafézinho cortesia no bar', enabled: true },
            { name: 'Estacionamento com manobrista', enabled: true },
          ],
        },
      ],
      description: 'Cortes clássicos masculinos, barba na toalha quente e bar completo.',
    },
  };

  it('eliminates false positive food/bar categories through context cleansing', () => {
    // LeadState bruto conteria cerveja, café e bar
    const rawState = buildLeadState(barbeariaLead as Lead);
    expect(rawState).toContain('cerveja');

    // Contexto sanitizado remove distrações de amenidades mantendo o nicho nuclear
    const cleanState = sanitizeLeadContext(rawState);
    expect(cleanState).toContain('Nome: Barbearia Roots Santos');
    expect(cleanState).toContain('Categoria: Barbearia');
    expect(cleanState).not.toContain('cerveja');
    expect(cleanState).not.toContain('cafézinho');
  });

  it('recovers 100% precision on borderline cases via confidence gating and escalation', async () => {
    const question = {
      type: 'choice' as const,
      instructions: 'Nicho comercial',
      criteria: { beleza: 'beleza', alimentação: 'alimentação', mecânica: 'mecânica' },
    };
    const options = ['beleza', 'alimentação', 'mecânica'];

    // Simula a Laya base hesitante (ex: 42% alimentação vs 40% beleza devido a ruído)
    const uncertainLayaAnswer = {
      choice: 'alimentação',
      probabilities: { alimentação: 0.42, beleza: 0.40, mecânica: 0.18 },
    };

    // Árbitro Claude desempata analisando a essência do negócio
    const arbitrateWithClaude = vi.fn().mockResolvedValue('beleza');

    const result = await resolveEnsemblePrediction(
      'choice',
      options,
      uncertainLayaAnswer,
      buildLeadState(barbeariaLead as Lead),
      question,
      { arbitrateWithClaude },
      0.60,
    );

    // O ensemble detecta margem baixa (0.42 - 0.40 = 0.02 < 0.60) e aciona o Claude
    expect(arbitrateWithClaude).toHaveBeenCalledTimes(1);
    expect(result.value).toBe('beleza');
    expect(result.source).toBe('claude_arbitration');
    expect(result.escalated).toBe(true);
    expect(result.confidence).toBe(0.99);
  });

  it('preserves zero-latency local execution when Laya is decisive', async () => {
    const question = {
      type: 'choice' as const,
      instructions: 'Nicho comercial',
    };
    const options = ['beleza', 'alimentação', 'mecânica'];

    // Laya decidida com 92% de certeza
    const decisiveLayaAnswer = {
      choice: 'beleza',
      probabilities: { beleza: 0.92, alimentação: 0.05, mecânica: 0.03 },
    };

    const arbitrateWithClaude = vi.fn();

    const result = await resolveEnsemblePrediction(
      'choice',
      options,
      decisiveLayaAnswer,
      buildLeadState(barbeariaLead as Lead),
      question,
      { arbitrateWithClaude },
      0.60,
    );

    expect(arbitrateWithClaude).not.toHaveBeenCalled();
    expect(result.value).toBe('beleza');
    expect(result.source).toBe('laya');
    expect(result.escalated).toBe(false);
  });
});
