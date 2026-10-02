import { describe, expect, it } from 'vitest';
import {
  allowedValues, buildLeadState, canTeach, canonicalValue, displayedCell, learningLabel, runCostLabel, mapLayaAnswer, normalizeLabel, parseColumnTitle, sortScore, toLayaQuestion,
} from './columns';

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

const baseLead = {
  name: 'Barbearia Navalha', category: 'Barbearia', rating: 4.8, review_count: 320,
  website: 'https://navalha.com.br', phone: '5513991234567', is_mobile: true,
};

describe('buildLeadState', () => {
  it('writes one fact per line in Portuguese', () => {
    expect(buildLeadState(baseLead)).toBe([
      'Nome: Barbearia Navalha', 'Categoria: Barbearia', 'Nota no Google: 4.8 (320 avaliações)',
      'Tem site', 'Tem celular',
    ].join('\n'));
  });
  it('adds place, extra categories, description and enabled "Sobre" items from raw', () => {
    const text = buildLeadState({
      ...baseLead,
      raw: {
        categories: ['Barbearia', 'Salão de beleza'],
        complete_address: { borough: 'Gonzaga', city: 'Santos' },
        description: 'Cortes clássicos e barba.',
        about: [
          { name: 'Serviços', options: [{ name: 'Aceita cartão', enabled: true }, { name: 'Wi-Fi', enabled: false }] },
          { name: 'Acessibilidade', options: [{ name: 'Entrada acessível', enabled: true }] },
        ],
      },
    });
    expect(text).toContain('Outras categorias: Salão de beleza');
    expect(text).toContain('Local: Gonzaga, Santos');
    expect(text).toContain('Descrição: Cortes clássicos e barba.');
    expect(text).toContain('Sobre: Aceita cartão, Entrada acessível');
    expect(text).not.toContain('Wi-Fi');
  });
  it('keeps an almost empty lead short and clean', () => {
    const text = buildLeadState({
      name: 'Loja X', category: null, rating: null, review_count: null, website: null, phone: null, is_mobile: false, raw: null,
    });
    expect(text).toBe('Nome: Loja X\nSem site');
    expect(text).not.toMatch(/undefined|null/);
  });
  it('says "Só telefone fixo" for landlines and caps the text at 1500 characters', () => {
    expect(buildLeadState({ ...baseLead, is_mobile: false })).toContain('Só telefone fixo');
    expect(buildLeadState({ ...baseLead, raw: { description: 'x'.repeat(3000) } }).length).toBe(1500);
  });
});

describe('toLayaQuestion', () => {
  it('builds the question each Laya type expects', () => {
    expect(toLayaQuestion({ kind: 'noul', options: [], instructions: 'Tem site?' }))
      .toEqual({ type: 'noul', instructions: 'Tem site?' });
    expect(toLayaQuestion({ kind: 'choice', options: ['saúde', 'beleza'], instructions: 'Nicho' }))
      .toEqual({ type: 'choice', instructions: 'Nicho', criteria: { saúde: 'saúde', beleza: 'beleza' } });
    expect(toLayaQuestion({ kind: 'score', options: ['baixo', 'médio', 'alto'], instructions: 'Dinheiro' }))
      .toEqual({ type: 'score', instructions: 'Dinheiro', criteria: ['baixo', 'médio', 'alto'] });
  });
});

describe('mapLayaAnswer', () => {
  it('noul: sim at 0.5 or more, confidence of the chosen side', () => {
    expect(mapLayaAnswer('noul', [], { noul: 0.88 })).toEqual({ value: 'sim', confidence: 0.88 });
    expect(mapLayaAnswer('noul', [], { noul: 0.2 })).toEqual({ value: 'não', confidence: 0.8 });
    expect(mapLayaAnswer('noul', [], { noul: 0.5 })).toEqual({ value: 'sim', confidence: 0.5 });
  });
  it('choice: the chosen option and its probability', () => {
    expect(mapLayaAnswer('choice', ['saúde', 'beleza'], {
      choice: 'beleza', probabilities: { saúde: 0.3, beleza: 0.7 }, answer_confidence: 0.7,
    })).toEqual({ value: 'beleza', confidence: 0.7 });
  });
  it('choice: an option outside the list is an error', () => {
    expect(() => mapLayaAnswer('choice', ['saúde'], { choice: 'esporte' }))
      .toThrow('Laya respondeu uma opção fora da lista: esporte');
  });
  it('score: the most probable level, not the rounded expected index', () => {
    expect(mapLayaAnswer('score', ['baixo', 'médio', 'alto'], {
      score: 1.345, probabilities: { 0: 0.1043, 1: 0.4464, 2: 0.4493 },
    })).toEqual({ value: 'alto', confidence: 0.449 });
  });
  it('missing answer or missing fields are errors', () => {
    expect(() => mapLayaAnswer('noul', [], undefined)).toThrow('Resposta do Laya sem a coluna');
    expect(() => mapLayaAnswer('noul', [], {})).toThrow('Resposta do Laya sem probabilidade de sim');
    expect(() => mapLayaAnswer('score', ['baixo'], {})).toThrow('Resposta do Laya sem probabilidades da nota');
  });
});

describe('allowedValues / canonicalValue', () => {
  it('lists valid values per kind', () => {
    expect(allowedValues('noul', [])).toEqual(['sim', 'não']);
    expect(allowedValues('score', [])).toEqual(['baixo', 'médio', 'alto']);
    expect(allowedValues('choice', ['a', 'b'])).toEqual(['a', 'b']);
  });
  it('maps any case/accent spelling to the canonical value, or null', () => {
    expect(canonicalValue('noul', [], 'NAO')).toBe('não');
    expect(canonicalValue('choice', ['saúde', 'beleza'], ' Beleza ')).toBe('beleza');
    expect(canonicalValue('score', [], 'medio')).toBe('médio');
    expect(canonicalValue('choice', ['saúde'], 'esporte')).toBeNull();
    expect(canonicalValue('noul', [], 42)).toBeNull();
  });
});

describe('displayedCell', () => {
  it('prefers the correction, shown as 100%', () => {
    expect(displayedCell({ value: 'sim', confidence: 0.7, corrected_value: 'não' }))
      .toEqual({ value: 'não', confidence: 1, corrected: true });
  });
  it('shows the model value with its confidence, or null when empty', () => {
    expect(displayedCell({ value: 'sim', confidence: 0.7, corrected_value: null }))
      .toEqual({ value: 'sim', confidence: 0.7, corrected: false });
    expect(displayedCell({ value: null, confidence: null, corrected_value: null })).toBeNull();
    expect(displayedCell(undefined)).toBeNull();
  });
});

describe('sortScore', () => {
  const cell = (value: string, confidence: number) => ({ value, confidence, corrected_value: null });
  it('yes/no: most likely "sim" first', () => {
    const scores = [cell('sim', 0.9), cell('não', 0.9), cell('sim', 0.6)].map((c) => sortScore('noul', [], c));
    expect(scores[0]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[1]);
  });
  it('score: higher level first, then confidence', () => {
    const opts = ['baixo', 'médio', 'alto'];
    expect(sortScore('score', opts, cell('alto', 0.4))).toBeGreaterThan(sortScore('score', opts, cell('médio', 0.99)));
  });
  it('choice: list order first; empty cells last', () => {
    const opts = ['saúde', 'beleza'];
    expect(sortScore('choice', opts, cell('saúde', 0.3))).toBeGreaterThan(sortScore('choice', opts, cell('beleza', 0.99)));
    expect(sortScore('choice', opts, undefined)).toBe(-1);
  });
});

describe('learning labels (parte B)', () => {
  const base = {
    status: 'done', teach_requested_at: null, taught_at: null, examples_count: null,
    head_accuracy: null, base_accuracy: null, claude_calls: null, head_decisions: null,
  } as const;

  it('says when Claude is teaching, the head is trained, or the column is still learning', () => {
    expect(learningLabel(base)).toBeNull();
    expect(learningLabel({ ...base, teach_requested_at: '2026-10-01' })).toBe('Claude ensinando…');
    expect(learningLabel({ ...base, examples_count: 1 })).toBe('aprendendo · 1 exemplo');
    expect(learningLabel({ ...base, examples_count: 14 })).toBe('aprendendo · 14 exemplos');
    expect(learningLabel({ ...base, examples_count: 30, head_accuracy: 0.914, base_accuracy: 0.48 }))
      .toBe('treinada · acerta 91% (base 48%)');
  });

  it('summarises what the last run cost', () => {
    expect(runCostLabel(base)).toBeNull();
    expect(runCostLabel({ ...base, claude_calls: 4, head_decisions: 0 })).toBe('Claude 4×');
    expect(runCostLabel({ ...base, claude_calls: 2, head_decisions: 20 })).toBe('Claude 2× · cabeça 20');
    expect(runCostLabel({ ...base, status: 'running', claude_calls: 2 })).toBeNull();
  });

  it('offers teaching once, and not on a failed column', () => {
    expect(canTeach(base)).toBe(true);
    expect(canTeach({ ...base, taught_at: '2026-10-01' })).toBe(false);
    expect(canTeach({ ...base, teach_requested_at: '2026-10-01' })).toBe(false);
    expect(canTeach({ ...base, status: 'failed' })).toBe(false);
  });
});
