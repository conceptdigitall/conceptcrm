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
  const base = { name: 'The Barbershop', category: 'Barbearia', rating: 4.7, review_count: 276, website: null };

  it('praises good ratings and pitches a site when there is none', () => {
    const msg = buildOutreachMessage(base);
    expect(msg).toContain('The Barbershop');
    expect(msg).toContain('4.7★ com 276 avaliações');
    expect(msg).toContain('ainda não têm site');
  });

  it('pitches the AI receptionist when the business already has a site', () => {
    const msg = buildOutreachMessage({ ...base, website: 'https://x.com' });
    expect(msg).toContain('recepcionista de IA');
    expect(msg).not.toContain('ainda não têm site');
  });

  it('skips praise for low ratings and never mentions price', () => {
    const msg = buildOutreachMessage({ ...base, rating: 3.9 });
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
