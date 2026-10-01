import { describe, expect, it } from 'vitest';
import { scoreLead } from './score';

describe('scoreLead', () => {
  it('scores the best opportunity at 100 with all reasons', () => {
    const r = scoreLead({ website: null, rating: 3.9, reviewCount: 12, isMobile: true });
    expect(r.score).toBe(100);
    expect(r.reasons).toEqual([
      'Sem site',
      'Nota baixa (3,9)',
      'Poucas avaliações (12)',
      'Tem celular (WhatsApp)',
    ]);
  });
  it('scores an established business at 0', () => {
    const r = scoreLead({ website: 'https://x.com.br', rating: 4.8, reviewCount: 320, isMobile: false });
    expect(r).toEqual({ score: 0, reasons: [] });
  });
  it('treats missing rating as no reviews, not low rating', () => {
    const r = scoreLead({ website: 'https://x.com.br', rating: null, reviewCount: null, isMobile: false });
    expect(r).toEqual({ score: 20, reasons: ['Sem avaliações'] });
  });
  it('treats a blank website string as no site', () => {
    expect(scoreLead({ website: '  ', rating: 4.8, reviewCount: 300, isMobile: false }).reasons)
      .toEqual(['Sem site']);
  });
});
