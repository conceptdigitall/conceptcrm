import { describe, expect, it } from 'vitest';
import { buildOutreachMessage, satisfactionLevel, whatsappUrl } from './outreach';

describe('satisfactionLevel', () => {
  it('needs volume to call it "muito-alta"', () => {
    expect(satisfactionLevel(4.9, 276)).toBe('muito-alta');
    expect(satisfactionLevel(4.9, 30)).toBe('alta');
    expect(satisfactionLevel(4.9, 3)).toBe('media');
  });

  it('grades by rating once there are enough reviews', () => {
    expect(satisfactionLevel(4.4, 80)).toBe('alta');
    expect(satisfactionLevel(4.0, 80)).toBe('media');
    expect(satisfactionLevel(3.2, 80)).toBe('baixa');
    expect(satisfactionLevel(3.2, 4)).toBe('baixa');
  });

  it('reports missing data', () => {
    expect(satisfactionLevel(null, null)).toBe('sem-dados');
    expect(satisfactionLevel(4.5, 0)).toBe('sem-dados');
  });
});

describe('buildOutreachMessage', () => {
  const base = { name: 'Escritório Alfa', category: 'Advocacia', rating: 4.8, review_count: 52, website: null };

  it('pitches wedding packages for wedding planners and suit rental stores', () => {
    const msg = buildOutreachMessage({
      name: 'Elegance Noivas & Ternos',
      category: 'Aluguel de Trajes e Ternos para Casamento',
      rating: 4.9,
      review_count: 88,
      website: null,
    });
    expect(msg).toContain('Elegance Noivas & Ternos');
    expect(msg).toContain('4.9★ com 88 avaliações');
    expect(msg).toContain('Dia do Noivo');
    expect(msg).toContain('Kawe');
  });

  it('pitches cross-promotion for lifestyle businesses (gyms, tattoo, crossfit)', () => {
    const msg = buildOutreachMessage({
      name: 'Iron Crossfit Casqueiro',
      category: 'Academia de Crossfit',
      rating: 4.7,
      review_count: 120,
      website: null,
    });
    expect(msg).toContain('Iron Crossfit Casqueiro');
    expect(msg).toContain('benefícios e vouchers cruzados');
    expect(msg).toContain('Kawe');
  });

  it('pitches corporate wellness agreements for local companies and offices', () => {
    const msg = buildOutreachMessage(base);
    expect(msg).toContain('Escritório Alfa');
    expect(msg).toContain('convênios corporativos de cuidados masculinos');
    expect(msg).toContain('voucher cortesia de primeiro corte');
    expect(msg).toContain('Kawe');
  });

  it('skips praise for low ratings and never mentions price', () => {
    const msg = buildOutreachMessage({ ...base, rating: 3.9, review_count: 5 });
    expect(msg).not.toContain('parabéns');
    expect(msg).not.toMatch(/R\$|reais|preço/i);
  });
});

describe('whatsappUrl', () => {
  it('keeps only digits and encodes the text', () => {
    expect(whatsappUrl('+55 (13) 99123-4567', 'Oi, tudo bem?')).toBe(
      'https://wa.me/5513991234567?text=Oi%2C%20tudo%20bem%3F',
    );
  });
});
