// Pauta semanal de marketing: a IA propõe 5 a 7 itens por semana e o João
// aprova, pede ajuste ou recusa cada um pelo celular. Este arquivo é só regra
// pura (prompt, parse, decisão); quem grava no banco é o worker/a API.
import type { MarketingPautaItem, MarketingSettings, PautaFormato } from '@/types';
import { activeHashtags } from './content';
import { weekStart } from './autopilot';

export const PAUTA_MIN_ITENS = 5;
export const PAUTA_MAX_ITENS = 7;
export const COMENTARIO_MAX = 1000;

const FORMATOS: PautaFormato[] = ['feed', 'story', 'reel'];
const DAY_MS = 24 * 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export const PAUTA_SYSTEM =
  'Você é o estrategista de conteúdo do Instagram da Concept Digital (sites, recepcionista de IA no WhatsApp e marketing com IA para pequenos negócios). Responda só com JSON válido.';

type PautaSettings = Pick<MarketingSettings, 'caption_style' | 'caption_size' | 'emoji_level' | 'cta' | 'never_use' | 'hashtags' | 'instagram_username'>;

function regrasLegenda(s: PautaSettings): string {
  const tags = activeHashtags(s.hashtags).join(' ');
  return `legenda pronta do Instagram em português do Brasil. Estilo ${s.caption_style}, tamanho ${s.caption_size}, emojis ${s.emoji_level}.`
    + (s.cta ? ` Termine com o CTA: ${s.cta}.` : '')
    + (s.never_use ? ` Nunca use: ${s.never_use}.` : '')
    + (tags ? ` Feche com as hashtags: ${tags}.` : '');
}

/** Data AAAA-MM-DD da segunda-feira (Brasília) da semana de `now`. */
export function semanaInicioISO(now: Date): string {
  return new Date(weekStart(now).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

function diasDaSemana(semanaInicio: string): string[] {
  const base = Date.parse(`${semanaInicio}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => new Date(base + i * DAY_MS).toISOString().slice(0, 10));
}

export function pautaPrompt(input: {
  semanaInicio: string;
  settings: PautaSettings;
  projects: string[];
  recentTitles: string[];
}): string {
  const { settings: s } = input;
  const dias = diasDaSemana(input.semanaInicio);
  return [
    `Crie a pauta de conteúdo da semana de ${dias[0]} a ${dias[6]} para o Instagram @${s.instagram_username || 'conceptdigita.l'}, com de ${PAUTA_MIN_ITENS} a ${PAUTA_MAX_ITENS} itens, um por dia no máximo.`,
    input.projects.length ? `Projetos reais que podem aparecer: ${input.projects.join('; ')}.` : '',
    input.recentTitles.length ? `Já saiu recentemente (não repita o tema): ${input.recentTitles.join(' | ')}.` : '',
    '',
    'Responda com um objeto JSON {"itens":[...]} em que cada item tem exatamente estas chaves:',
    `- "dia": data AAAA-MM-DD entre ${dias[0]} e ${dias[6]}.`,
    '- "formato": "feed", "story" ou "reel".',
    '- "tema": tema curto do post (até 60 caracteres).',
    '- "gancho": primeira frase que prende a atenção.',
    '- "roteiro": até 6 falas ou cenas, separadas por \\n.',
    `- "legenda_base": ${regrasLegenda(s)}`,
    '',
    'Só fatos gerais da Concept; não invente preço, cliente ou número.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

export function ajustePrompt(item: MarketingPautaItem, comentario: string): string {
  return [
    'Reescreva este item da pauta aplicando o pedido de ajuste. Mantenha o que não foi criticado.',
    '',
    `Item atual (${item.formato}, dia ${item.dia}):`,
    `tema: ${item.tema}`,
    `gancho: ${item.gancho}`,
    `roteiro: ${item.roteiro}`,
    `legenda_base: ${item.legenda_base}`,
    '',
    `Pedido de ajuste: ${comentario.trim().slice(0, COMENTARIO_MAX)}`,
    '',
    'Responda só com um objeto JSON com as chaves "tema", "gancho", "roteiro" (até 6 falas separadas por \\n) e "legenda_base". Não invente preço, cliente ou número.',
  ].join('\n');
}

export type PautaItemNovo = Pick<MarketingPautaItem, 'dia' | 'formato' | 'tema' | 'gancho' | 'roteiro' | 'legenda_base'>;

function parseObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]);
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Lê o JSON da IA; null se vier quebrado ou com menos de 5 itens válidos. */
export function parsePautaItens(raw: string, semanaInicio: string): PautaItemNovo[] | null {
  const o = parseObject(raw);
  if (!o || !Array.isArray(o.itens)) return null;
  const dias = new Set(diasDaSemana(semanaInicio));
  const itens: PautaItemNovo[] = [];
  for (const it of o.itens) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    const dia = txt(r.dia, 10);
    const formato = r.formato as PautaFormato;
    if (!dias.has(dia) || !FORMATOS.includes(formato)) continue;
    const tema = txt(r.tema, 120);
    const gancho = txt(r.gancho, 300);
    const roteiro = txt(r.roteiro, 1500);
    const legenda_base = txt(r.legenda_base, 2200);
    if (!tema || !gancho || !roteiro || !legenda_base) continue;
    itens.push({ dia, formato, tema, gancho, roteiro, legenda_base });
  }
  if (itens.length < PAUTA_MIN_ITENS) return null;
  return itens.slice(0, PAUTA_MAX_ITENS);
}

/** Lê o item reescrito (sem dia/formato, que não mudam); null se faltar campo. */
export function parseItemAjustado(raw: string): Omit<PautaItemNovo, 'dia' | 'formato'> | null {
  const o = parseObject(raw);
  if (!o) return null;
  const tema = txt(o.tema, 120);
  const gancho = txt(o.gancho, 300);
  const roteiro = txt(o.roteiro, 1500);
  const legenda_base = txt(o.legenda_base, 2200);
  if (!tema || !gancho || !roteiro || !legenda_base) return null;
  return { tema, gancho, roteiro, legenda_base };
}

export type ItemDecision = 'approve' | 'adjust' | 'reject';

export function isItemDecision(v: unknown): v is ItemDecision {
  return v === 'approve' || v === 'adjust' || v === 'reject';
}

/** Campos a gravar no item para a decisão; `{ error }` se a decisão for inválida. */
export function itemDecisionPatch(d: ItemDecision, comment?: unknown): Record<string, unknown> | { error: string } {
  const c = typeof comment === 'string' ? comment.trim().slice(0, COMENTARIO_MAX) : '';
  if (d === 'approve') return { status: 'aprovado', comentario: null };
  if (d === 'adjust') {
    if (!c) return { error: 'adjust exige comment (1 a 1000 caracteres)' };
    return { status: 'ajuste', comentario: c };
  }
  return { status: 'recusado', comentario: c || null };
}
