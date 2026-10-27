import { describe, expect, it } from 'vitest';
import {
  ajustePrompt, isItemDecision, itemDecisionPatch, parseItemAjustado, parsePautaItens,
  pautaPrompt, semanaInicioISO,
} from './pauta';
import type { MarketingPautaItem } from '@/types';

const DIAS = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];

function json(n: number, extra: Record<string, unknown> = {}) {
  const itens = Array.from({ length: n }, (_, i) => ({
    dia: DIAS[i % 7], formato: 'feed', tema: `Tema ${i}`, gancho: `Gancho ${i}`,
    roteiro: 'Fala 1\nFala 2', legenda_base: `Legenda ${i}`, ...extra,
  }));
  return JSON.stringify({ itens });
}

describe('parsePautaItens', () => {
  it('aceita de 5 a 7 itens com dia dentro da semana', () => {
    const itens = parsePautaItens(json(6), '2026-10-26');
    expect(itens).toHaveLength(6);
    expect(itens!.every((i) => i.dia >= '2026-10-26' && i.dia <= '2026-11-01')).toBe(true);
  });
  it('recusa menos de 5 itens, formato desconhecido ou JSON quebrado', () => {
    expect(parsePautaItens(json(4), '2026-10-26')).toBeNull();
    expect(parsePautaItens(json(5, { formato: 'tiktok' }), '2026-10-26')).toBeNull();
    expect(parsePautaItens('não é json', '2026-10-26')).toBeNull();
  });
  it('corta em 7 quando a IA manda mais', () => {
    expect(parsePautaItens(json(9), '2026-10-26')).toHaveLength(7);
  });
  it('descarta dia fora da semana e devolve null se sobrar menos de 5', () => {
    expect(parsePautaItens(json(6, { dia: '2026-11-05' }), '2026-10-26')).toBeNull();
  });
  it('aceita cerca ```json', () => {
    expect(parsePautaItens('```json\n' + json(5) + '\n```', '2026-10-26')).toHaveLength(5);
  });
});

describe('parseItemAjustado', () => {
  it('lê tema, gancho, roteiro e legenda; null se faltar campo', () => {
    const ok = parseItemAjustado('{"tema":"a","gancho":"b","roteiro":"c","legenda_base":"d"}');
    expect(ok).toEqual({ tema: 'a', gancho: 'b', roteiro: 'c', legenda_base: 'd' });
    expect(parseItemAjustado('{"tema":"a"}')).toBeNull();
    expect(parseItemAjustado('nada')).toBeNull();
  });
});

describe('itemDecisionPatch', () => {
  it('adjust sem comentário é erro; com comentário vira ajuste', () => {
    expect(itemDecisionPatch('adjust', '  ')).toEqual({ error: expect.any(String) });
    expect(itemDecisionPatch('adjust', 'mais curto')).toEqual({ status: 'ajuste', comentario: 'mais curto' });
    expect(itemDecisionPatch('approve')).toEqual({ status: 'aprovado', comentario: null });
    expect(itemDecisionPatch('reject', 'fora do tom')).toEqual({ status: 'recusado', comentario: 'fora do tom' });
  });
  it('corta comentário em 1000 caracteres', () => {
    const p = itemDecisionPatch('adjust', 'x'.repeat(1500)) as { comentario: string };
    expect(p.comentario).toHaveLength(1000);
  });
  it('isItemDecision valida', () => {
    expect(isItemDecision('approve')).toBe(true);
    expect(isItemDecision('nope')).toBe(false);
  });
});

describe('semanaInicioISO', () => {
  it('semana começa na segunda em Brasília', () => {
    expect(semanaInicioISO(new Date('2026-11-02T02:00:00Z'))).toBe('2026-10-26'); // domingo 23h BRT
    expect(semanaInicioISO(new Date('2026-11-02T03:00:00Z'))).toBe('2026-11-02');
  });
});

describe('prompts', () => {
  const settings = {
    caption_style: 'direto', caption_size: 'media', emoji_level: 'poucos', cta: 'Chame no WhatsApp',
    never_use: 'garantido', hashtags: [], instagram_username: 'conceptdigita.l',
  } as unknown as Parameters<typeof pautaPrompt>[0]['settings'];
  it('pautaPrompt traz semana, regras de legenda e projetos', () => {
    const p = pautaPrompt({ semanaInicio: '2026-10-26', settings, projects: ['Barbearia X'], recentTitles: ['Antigo'] });
    expect(p).toContain('2026-10-26');
    expect(p).toContain('Chame no WhatsApp');
    expect(p).toContain('garantido');
    expect(p).toContain('Barbearia X');
    expect(p).toContain('Antigo');
    expect(p).toContain('não invente preço');
  });
  it('ajustePrompt inclui o comentário e o item atual', () => {
    const item = { tema: 'T', gancho: 'G', roteiro: 'R', legenda_base: 'L', formato: 'reel', dia: '2026-10-27' } as MarketingPautaItem;
    const p = ajustePrompt(item, 'mais curto');
    expect(p).toContain('mais curto');
    expect(p).toContain('T');
  });
});
