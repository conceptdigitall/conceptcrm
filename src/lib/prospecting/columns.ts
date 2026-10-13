import type { ColumnKind, Lead, LeadColumn, LeadColumnValue } from '@/types';

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

export const MAX_STATE_CHARS = 1500;

export type LeadStateInput = Pick<Lead, 'name' | 'category' | 'rating' | 'review_count' | 'website' | 'phone' | 'is_mobile'> & {
  raw?: Record<string, unknown> | null;
};

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function enabledAboutItems(about: unknown): string[] {
  if (!Array.isArray(about)) return [];
  return about.flatMap((section) => {
    const options = (section as { options?: unknown })?.options;
    if (!Array.isArray(options)) return [];
    return options.flatMap((o) => {
      const item = o as { name?: unknown; enabled?: unknown };
      return item?.enabled === true && text(item.name) ? [text(item.name) as string] : [];
    });
  });
}

// What Laya reads about one lead: short, one fact per line, nothing empty.
export function buildLeadState(lead: LeadStateInput): string {
  const raw = lead.raw ?? {};
  const lines = [`Nome: ${lead.name}`];
  if (lead.category) lines.push(`Categoria: ${lead.category}`);
  const extra = Array.isArray(raw.categories)
    ? raw.categories.filter((c): c is string => typeof c === 'string' && c !== lead.category)
    : [];
  if (extra.length > 0) lines.push(`Outras categorias: ${extra.join(', ')}`);
  const address = (raw.complete_address ?? {}) as Record<string, unknown>;
  const place = [text(address.borough), text(address.city)].filter(Boolean).join(', ');
  if (place) lines.push(`Local: ${place}`);
  if (lead.rating != null) lines.push(`Nota no Google: ${lead.rating} (${lead.review_count ?? 0} avaliações)`);
  lines.push(lead.website ? 'Tem site' : 'Sem site');
  if (lead.phone) lines.push(lead.is_mobile ? 'Tem celular' : 'Só telefone fixo');
  const description = text(raw.description);
  if (description) lines.push(`Descrição: ${description}`);
  const about = enabledAboutItems(raw.about);
  if (about.length > 0) lines.push(`Sobre: ${about.join(', ')}`);
  return lines.join('\n').slice(0, MAX_STATE_CHARS);
}

export interface LayaQuestion {
  type: ColumnKind;
  instructions: string;
  criteria?: Record<string, string> | string[];
}

export function parseDefinitions(raw: string | null | undefined): Record<string, string> {
  if (!raw || typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.trim()) {
            out[k.trim()] = v.trim();
          }
        }
        return out;
      }
    } catch {
      // fallback to line parsing
    }
  }

  const out: Record<string, string> = {};
  const lines = trimmed.split('\n');
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim();
      if (key && val) out[key] = val;
    }
  }
  return out;
}

export function formatDefinitions(defs: Record<string, string>): string {
  return JSON.stringify(defs);
}

export function toLayaQuestion(
  c: Pick<ParsedColumn, 'kind' | 'options' | 'instructions'>,
  definition?: string | null,
): LayaQuestion {
  const defs = parseDefinitions(definition);
  if (c.kind === 'noul') {
    const hasDefs = Object.keys(defs).length > 0;
    return { type: 'noul', instructions: c.instructions, ...(hasDefs ? { criteria: defs } : {}) };
  }
  if (c.kind === 'choice') {
    const criteria: Record<string, string> = {};
    for (const opt of c.options) {
      criteria[opt] = defs[opt] ? `${opt}: ${defs[opt]}` : opt;
    }
    return { type: 'choice', instructions: c.instructions, criteria };
  }
  const hasDefs = Object.keys(defs).length > 0;
  const criteria = hasDefs
    ? c.options.map((o) => (defs[o] ? `${o}: ${defs[o]}` : o))
    : [...c.options];
  return { type: 'score', instructions: c.instructions, criteria };
}

export interface LayaAnswer {
  noul?: number;
  choice?: string;
  score?: number;
  probabilities?: Record<string, number>;
  answer_confidence?: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function mapLayaAnswer(
  kind: ColumnKind, options: string[], answer: LayaAnswer | undefined,
): { value: string; confidence: number } {
  if (!answer) throw new Error('Resposta do Laya sem a coluna');
  if (kind === 'noul') {
    if (typeof answer.noul !== 'number') throw new Error('Resposta do Laya sem probabilidade de sim');
    const yes = answer.noul >= 0.5;
    return { value: yes ? 'sim' : 'não', confidence: round3(yes ? answer.noul : 1 - answer.noul) };
  }
  const probabilities = answer.probabilities ?? {};
  if (kind === 'choice') {
    const value = options.find((o) => o === answer.choice);
    if (!value) throw new Error(`Laya respondeu uma opção fora da lista: ${String(answer.choice)}`);
    return { value, confidence: round3(probabilities[value] ?? answer.answer_confidence ?? 0) };
  }
  // score: `score` is the expected index (a float); use the most probable level instead.
  let best = -1;
  let bestP = -1;
  for (const [key, p] of Object.entries(probabilities)) {
    const i = Number(key);
    if (Number.isInteger(i) && i >= 0 && i < options.length && p > bestP) {
      best = i;
      bestP = p;
    }
  }
  if (best < 0) throw new Error('Resposta do Laya sem probabilidades da nota');
  return { value: options[best], confidence: round3(bestP) };
}

export function allowedValues(kind: ColumnKind, options: string[]): string[] {
  if (kind === 'noul') return [...NOUL_VALUES];
  if (kind === 'score') return [...SCORE_LEVELS];
  return options;
}

export function canonicalValue(kind: ColumnKind, options: string[], input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const key = normalizeLabel(input);
  return allowedValues(kind, options).find((v) => normalizeLabel(v) === key) ?? null;
}

export const LOW_CONFIDENCE = 0.6;

export type CellLike = Pick<LeadColumnValue, 'value' | 'confidence' | 'corrected_value'>;

export function displayedCell(
  cell: CellLike | undefined,
): { value: string; confidence: number; corrected: boolean } | null {
  if (!cell) return null;
  if (cell.corrected_value) return { value: cell.corrected_value, confidence: 1, corrected: true };
  if (cell.value) return { value: cell.value, confidence: Number(cell.confidence ?? 0), corrected: false };
  return null;
}

// Bigger = higher in the table. Levels/options dominate, confidence breaks ties.
export function sortScore(kind: ColumnKind, options: string[], cell: CellLike | undefined): number {
  const shown = displayedCell(cell);
  if (!shown) return -1;
  if (kind === 'noul') return shown.value === 'sim' ? shown.confidence : 1 - shown.confidence;
  const values = allowedValues(kind, options);
  const index = values.indexOf(shown.value);
  const rank = kind === 'score' ? index : values.length - 1 - index;
  return rank * 2 + shown.confidence;
}

// Parte B: how the column is learning, in one short line for its header.
export type LearningInfo = Pick<
  LeadColumn,
  'status' | 'teach_requested_at' | 'taught_at' | 'examples_count' | 'head_accuracy' | 'base_accuracy'
  | 'claude_calls' | 'head_decisions'
>;

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function learningLabel(c: LearningInfo): string | null {
  if (c.teach_requested_at && !c.taught_at) return 'Claude ensinando…';
  if (c.head_accuracy != null) {
    return `treinada · acerta ${pct(c.head_accuracy)}${c.base_accuracy != null ? ` (base ${pct(c.base_accuracy)})` : ''}`;
  }
  if (c.examples_count) return `aprendendo · ${c.examples_count} exemplo${c.examples_count === 1 ? '' : 's'}`;
  return null;
}

/** What the last run cost: how many cells Claude and the trained head decided. */
export function runCostLabel(c: LearningInfo): string | null {
  if (c.status !== 'done' || c.claude_calls == null) return null;
  const parts = [`Claude ${c.claude_calls}×`];
  if (c.head_decisions) parts.push(`cabeça ${c.head_decisions}`);
  return parts.join(' · ');
}

export function canTeach(c: LearningInfo): boolean {
  return !c.teach_requested_at && !c.taught_at && c.status !== 'failed';
}
