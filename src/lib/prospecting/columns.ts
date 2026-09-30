import type { ColumnKind } from '@/types';

export const SCORE_LEVELS = ['baixo', 'médio', 'alto'] as const;
export const NOUL_VALUES = ['sim', 'não'] as const;
export const MAX_TITLE = 120;
export const MAX_COLUMNS = 10;
const MAX_OPTIONS = 8;
const MAX_OPTION_CHARS = 40;

export interface ParsedColumn {
  title: string;
  kind: ColumnKind;
  options: string[];
  instructions: string;
}

export type ParseResult = { ok: true; value: ParsedColumn } | { ok: false; error: string };

export function normalizeLabel(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// The title is the only thing João types: its shape decides the column type.
export function parseColumnTitle(input: unknown): ParseResult {
  if (typeof input !== 'string') return { ok: false, error: 'Escreva o título da coluna' };
  const title = input.replace(/\s+/g, ' ').trim();
  if (!title) return { ok: false, error: 'Escreva o título da coluna' };
  if (title.length > MAX_TITLE) return { ok: false, error: `Título com no máximo ${MAX_TITLE} caracteres` };

  if (title.endsWith('?')) {
    return { ok: true, value: { title, kind: 'noul', options: [], instructions: title } };
  }

  const colon = title.indexOf(':');
  if (colon !== -1) {
    const theme = title.slice(0, colon).trim();
    if (!theme) return { ok: false, error: 'Escreva o tema antes dos dois-pontos (ex.: Nicho: saúde, beleza)' };
    const options = title.slice(colon + 1).split(',').map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) return { ok: false, error: 'Use pelo menos 2 opções separadas por vírgula' };
    if (options.length > MAX_OPTIONS) return { ok: false, error: `No máximo ${MAX_OPTIONS} opções` };
    if (options.some((o) => o.length > MAX_OPTION_CHARS)) {
      return { ok: false, error: `Cada opção com no máximo ${MAX_OPTION_CHARS} caracteres` };
    }
    const seen = new Set<string>();
    for (const option of options) {
      const key = normalizeLabel(option);
      if (seen.has(key)) return { ok: false, error: `Opção repetida: ${option}` };
      seen.add(key);
    }
    return { ok: true, value: { title, kind: 'choice', options, instructions: theme } };
  }

  return { ok: true, value: { title, kind: 'score', options: [...SCORE_LEVELS], instructions: title } };
}
