import { describe, expect, it, vi } from 'vitest';
import {
  sanitizeLeadContext,
  assessLayaConfidence,
  resolveEnsemblePrediction,
} from './reliable-inference';

describe('reliable-inference ensemble', () => {
  describe('sanitizeLeadContext', () => {
    it('preserves core identity and location lines intact', () => {
      const input = [
        'Nome: Barbearia Vintage',
        'Categoria: Barbearia',
        'Local: Gonzaga, Santos, SP',
        'Nota no Google: 4.9 (120 avaliações)',
        'Tem site',
        'Tem celular',
      ].join('\n');

      expect(sanitizeLeadContext(input)).toBe(input);
    });

    it('strips spurious amenity keywords that confuse category classification', () => {
      const input = [
        'Nome: Barbearia do Porto',
        'Categoria: Barbearia',
        'Sobre: Oferecemos cafézinho e chopp gelado enquanto você aguarda no nosso bar com wi-fi.',
      ].join('\n');

      const sanitized = sanitizeLeadContext(input);
      expect(sanitized).toContain('Nome: Barbearia do Porto');
      expect(sanitized).toContain('Categoria: Barbearia');
      expect(sanitized).not.toContain('cafézinho');
      expect(sanitized).not.toContain('chopp');
      expect(sanitized).not.toContain('bar');
    });
  });

  describe('assessLayaConfidence', () => {
    it('identifies high confidence in binary noul questions', () => {
      const result = assessLayaConfidence('noul', ['sim', 'não'], { noul: 0.95 });
      expect(result.value).toBe('sim');
      expect(result.confidence).toBe(0.95);
      expect(result.margin).toBe(0.9);
      expect(result.isConfident).toBe(true);
    });

    it('identifies low confidence in borderline binary noul questions', () => {
      const result = assessLayaConfidence('noul', ['sim', 'não'], { noul: 0.54 });
      expect(result.value).toBe('sim');
      expect(result.confidence).toBe(0.54);
      expect(result.margin).toBeCloseTo(0.08, 2);
      expect(result.isConfident).toBe(false);
    });

    it('evaluates probability gap in choice classification', () => {
      const confident = assessLayaConfidence('choice', ['beleza', 'alimentação', 'saúde'], {
        choice: 'beleza',
        probabilities: { beleza: 0.85, alimentação: 0.10, saúde: 0.05 },
      });
      expect(confident.value).toBe('beleza');
      expect(confident.margin).toBe(0.75);
      expect(confident.isConfident).toBe(true);

      const uncertain = assessLayaConfidence('choice', ['beleza', 'alimentação', 'saúde'], {
        choice: 'beleza',
        probabilities: { beleza: 0.45, alimentação: 0.40, saúde: 0.15 },
      });
      expect(uncertain.margin).toBe(0.05);
      expect(uncertain.isConfident).toBe(false);
    });
  });

  describe('resolveEnsemblePrediction', () => {
    const question = { type: 'choice' as const, instructions: 'Nicho do negócio' };

    it('accepts fast local Laya prediction when confidence is high without escalating', async () => {
      const arbitrateWithClaude = vi.fn();
      const answer = {
        choice: 'beleza',
        probabilities: { beleza: 0.90, alimentação: 0.05, outros: 0.05 },
      };

      const result = await resolveEnsemblePrediction(
        'choice',
        ['beleza', 'alimentação', 'outros'],
        answer,
        'Nome: Salão Elegance\nCategoria: Salão de beleza',
        question,
        { arbitrateWithClaude },
      );

      expect(result.value).toBe('beleza');
      expect(result.source).toBe('laya');
      expect(result.escalated).toBe(false);
      expect(arbitrateWithClaude).not.toHaveBeenCalled();
    });

    it('escalates to Claude arbitration when Laya is uncertain, guaranteeing 100% precision', async () => {
      const arbitrateWithClaude = vi.fn().mockResolvedValue('beleza');
      const answer = {
        choice: 'alimentação', // Laya errou por pouca margem
        probabilities: { alimentação: 0.46, beleza: 0.44, outros: 0.10 },
      };

      const result = await resolveEnsemblePrediction(
        'choice',
        ['beleza', 'alimentação', 'outros'],
        answer,
        'Nome: Barbearia Prime\nCategoria: Barbearia\nSobre: Temos café',
        question,
        { arbitrateWithClaude },
      );

      expect(arbitrateWithClaude).toHaveBeenCalledTimes(1);
      expect(result.value).toBe('beleza');
      expect(result.source).toBe('claude_arbitration');
      expect(result.escalated).toBe(true);
      expect(result.confidence).toBe(0.99);
    });
  });
});
