import { describe, expect, it } from 'vitest';
import { buildArtContent, headlineSize } from './post-art-content';

const settings = { business_name: 'Barbearia do Alemão', business_niche: 'barbearia' as const, instagram_username: 'alemao.barber' };

function post(over: Partial<Parameters<typeof buildArtContent>[0]> = {}) {
  return { id: 'abc', kind: 'feed' as const, title: '', idea: '', frames: [], ...over };
}

describe('buildArtContent', () => {
  it('usa o texto do frame e tira o rótulo interno do story', () => {
    const c = buildArtContent(post({ title: 'Story Manhã — Pergunta do Dia', frames: [{ text: '', interaction: 'nenhuma' }] }), settings);
    expect(c.headline).toBe('Pergunta do Dia');
  });

  it('prefere o texto do frame ao título', () => {
    const c = buildArtContent(post({ title: 'Story Tarde — X', frames: [{ text: 'Corte na régua', interaction: 'nenhuma' }] }), settings);
    expect(c.headline).toBe('Corte na régua');
  });

  it('tira o prefixo [Negócio] da ideia e usa só a primeira frase', () => {
    const c = buildArtContent(post({ title: '3 sinais', idea: '[Barbearia do Alemão] Visual em dia muda tudo. Agende já.' }), settings);
    expect(c.support).toBe('Visual em dia muda tudo.');
  });

  it('não repete a chamada no apoio', () => {
    const c = buildArtContent(post({ title: 'Promoção de corte hoje', idea: 'Promoção de corte hoje por R$ 40' }), settings);
    expect(c.support).toBe('');
  });

  it('corta chamada longa em palavra inteira com reticências', () => {
    const c = buildArtContent(post({ title: 'palavra '.repeat(30) }), settings);
    expect(c.headline.length).toBeLessThanOrEqual(90);
    expect(c.headline.endsWith('…')).toBe(true);
    expect(c.headline).not.toMatch(/ …$/);
  });

  it('monta CTA, @ e marca pelo nicho e ajustes', () => {
    const c = buildArtContent(post({ title: 'Oi' }), settings);
    expect(c).toMatchObject({ cta: 'Agende pelo WhatsApp', handle: '@alemao.barber', brand: 'Barbearia do Alemão', tag: 'Barbearia' });
  });

  it('cai no padrão sem ajustes e mantém o layout estável por post', () => {
    const a = buildArtContent(post({ title: 'Oi' }), {});
    expect(a).toMatchObject({ handle: '@conceptdigita.l', brand: 'Concept Digital', cta: 'Fale com a gente' });
    expect(buildArtContent(post({ title: 'Oi' }), {}).layout).toBe(a.layout);
  });
});

describe('preço na arte', () => {
  it('mantém "R$" junto do valor', () => {
    const c = buildArtContent(post({ title: 'Corte + barba por R$ 65' }), settings);
    expect(c.headline).toBe('Corte + barba por R$ 65');
  });
});

describe('headlineSize', () => {
  it('diminui conforme a frase cresce e é maior no story', () => {
    expect(headlineSize('curta', 'feed')).toBeGreaterThan(headlineSize('x'.repeat(50), 'feed'));
    expect(headlineSize('x'.repeat(50), 'feed')).toBeGreaterThan(headlineSize('x'.repeat(80), 'feed'));
    expect(headlineSize('curta', 'story')).toBeGreaterThan(headlineSize('curta', 'feed'));
  });
});
