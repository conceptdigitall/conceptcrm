import { describe, expect, it } from 'vitest';
import { normalizeLabel, parseColumnTitle } from './columns';

describe('normalizeLabel', () => {
  it('ignores accents, case and surrounding spaces', () => {
    expect(normalizeLabel('  Saúde ')).toBe('saude');
    expect(normalizeLabel('NÃO')).toBe('nao');
  });
});

describe('parseColumnTitle', () => {
  it('a title ending in ? is a yes/no column', () => {
    expect(parseColumnTitle('Tem site?')).toEqual({
      ok: true, value: { title: 'Tem site?', kind: 'noul', options: [], instructions: 'Tem site?' },
    });
  });
  it('"Tema: a, b, c" is a choice column with trimmed options', () => {
    expect(parseColumnTitle('Nicho: saúde, beleza , alimentação')).toEqual({
      ok: true,
      value: {
        title: 'Nicho: saúde, beleza , alimentação', kind: 'choice',
        options: ['saúde', 'beleza', 'alimentação'], instructions: 'Nicho',
      },
    });
  });
  it('accepts options without spaces and collapses repeated spaces', () => {
    const r = parseColumnTitle('Nicho:saúde,beleza');
    expect(r.ok && r.value.options).toEqual(['saúde', 'beleza']);
    const s = parseColumnTitle('Tem   site??');
    expect(s.ok && s.value).toMatchObject({ kind: 'noul', title: 'Tem site??' });
  });
  it('a question wins over a colon', () => {
    const r = parseColumnTitle('Obs: tem site?');
    expect(r.ok && r.value.kind).toBe('noul');
  });
  it('any other title is a score column with fixed levels', () => {
    expect(parseColumnTitle('Parece ter dinheiro')).toEqual({
      ok: true,
      value: { title: 'Parece ter dinheiro', kind: 'score', options: ['baixo', 'médio', 'alto'], instructions: 'Parece ter dinheiro' },
    });
  });
  it('refuses empty, non-string and too-long titles', () => {
    expect(parseColumnTitle('   ')).toEqual({ ok: false, error: 'Escreva o título da coluna' });
    expect(parseColumnTitle(undefined)).toEqual({ ok: false, error: 'Escreva o título da coluna' });
    expect(parseColumnTitle('a'.repeat(121))).toEqual({ ok: false, error: 'Título com no máximo 120 caracteres' });
  });
  it('refuses choice titles with a bad option list', () => {
    expect(parseColumnTitle(': a, b')).toEqual({ ok: false, error: 'Escreva o tema antes dos dois-pontos (ex.: Nicho: saúde, beleza)' });
    expect(parseColumnTitle('Nicho: saúde')).toEqual({ ok: false, error: 'Use pelo menos 2 opções separadas por vírgula' });
    expect(parseColumnTitle('N: a, b, c, d, e, f, g, h, i')).toEqual({ ok: false, error: 'No máximo 8 opções' });
    expect(parseColumnTitle('Nicho: saúde, Saude')).toEqual({ ok: false, error: 'Opção repetida: Saude' });
    expect(parseColumnTitle(`Nicho: a, ${'b'.repeat(41)}`)).toEqual({ ok: false, error: 'Cada opção com no máximo 40 caracteres' });
  });
});
