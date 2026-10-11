import type {
  CaptionSize, CaptionStyle, EmojiLevel, HashtagGroup, MarketingProject,
  MarketingSettings, PostStatus,
} from '@/types';

export const MAX_HASHTAGS = 8;

export const CAPTION_STYLES: { value: CaptionStyle; label: string; hint: string }[] = [
  { value: 'direto', label: 'Direto', hint: 'Frase curta, benefício e chamada.' },
  { value: 'educativo', label: 'Educativo', hint: 'Ensina algo em passos.' },
  { value: 'provocativo', label: 'Provocativo', hint: 'Abre com pergunta que incomoda.' },
  { value: 'storytelling', label: 'Storytelling', hint: 'Conta um caso real.' },
];

export const DEFAULT_HASHTAGS: HashtagGroup[] = [
  { group: 'Marca', tags: [{ t: '#conceptdigital', on: true }, { t: '#agenciadigital', on: true }] },
  { group: 'Nicho', tags: [
    { t: '#marketingdigital', on: true }, { t: '#sitesprofissionais', on: true },
    { t: '#automacao', on: true }, { t: '#crm', on: true }, { t: '#ia', on: true },
  ] },
  { group: 'Local', tags: [{ t: '#santos', on: true }, { t: '#baixadasantista', on: true }] },
];

export const DEFAULT_SETTINGS: Omit<MarketingSettings, 'account_id'> = {
  caption_style: 'direto',
  caption_size: 'media',
  emoji_level: 'poucos',
  cta: 'Chama no direct e pede seu diagnóstico grátis.',
  never_use: 'promessas de resultado garantido, preço',
  hashtags: DEFAULT_HASHTAGS,
  require_approval: true,
  instagram_username: 'conceptdigita.l',
};

const STYLE_WRAP: Record<CaptionStyle, (idea: string) => string> = {
  direto: (i) => i,
  educativo: (i) => `Passo a passo: ${i}`,
  provocativo: (i) => `Quantas vezes você ignorou isto? ${i}`,
  storytelling: (i) => `Semana passada vimos acontecer: ${i}`,
};

const EMOJI: Record<EmojiLevel, string> = { nenhum: '', poucos: ' 🚀', muitos: ' 🚀🔥✅' };

export function activeHashtags(groups: HashtagGroup[], max = MAX_HASHTAGS): string[] {
  return groups.flatMap((g) => g.tags.filter((x) => x.on).map((x) => x.t)).slice(0, max);
}

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? '';
  return s || text.trim();
}

export function buildCaption(
  s: Pick<MarketingSettings, 'caption_style' | 'caption_size' | 'emoji_level' | 'cta' | 'hashtags'>,
  idea: string,
  size: CaptionSize = s.caption_size,
): string {
  let body = STYLE_WRAP[s.caption_style](idea.trim());
  if (size === 'curta') body = firstSentence(body);
  const parts = [body + EMOJI[s.emoji_level]];
  if (size === 'longa') parts.push('Na Concept, site, CRM e automação trabalham juntos.');
  if (s.cta.trim()) parts.push(s.cta.trim());
  const tags = activeHashtags(s.hashtags).join(' ');
  if (tags) parts.push(tags);
  return parts.join('\n\n');
}

export const VARIATION_FIELDS = [
  { key: 'titulo', label: 'Texto na tela' },
  { key: 'narracao', label: 'Narração' },
  { key: 'midia', label: 'Foto ou trecho' },
  { key: 'visual', label: 'Cores e fonte' },
  { key: 'legenda', label: 'Legenda e hashtags' },
] as const;

export function variationPrompt(base: string, changes: string[], instruction: string): string {
  const what = changes.length ? changes.join(', ') : 'apenas o que a instrução pedir';
  return `${base.trim()}\n\nVariação do vídeo anterior: mantenha tudo igual e mude somente: ${what}. ${instruction.trim()}`.trim();
}

export const PROJECT_VIDEO_KINDS = [
  { value: 'mockup', label: 'Mockup rápido', hint: 'Site em celular e computador, com zoom nas partes principais' },
  { value: 'resumo', label: 'Resumo do projeto', hint: 'O que foi feito, para quem e o resultado' },
  { value: 'antes-depois', label: 'Antes e depois', hint: 'Compara o cenário antigo com o novo' },
] as const;
export type ProjectVideoKind = (typeof PROJECT_VIDEO_KINDS)[number]['value'];

export const PROJECT_DURATIONS = [15, 30, 45] as const;

export function projectVideoPrompt(p: Pick<MarketingProject, 'name' | 'url'>, kind: ProjectVideoKind, seconds: number): string {
  const label = PROJECT_VIDEO_KINDS.find((k) => k.value === kind)?.label ?? kind;
  const src = p.url ? ` Site: ${p.url}.` : '';
  return `${label} do projeto "${p.name}", ${seconds} segundos, vertical.${src} Com narração em português.`;
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'Rascunho',
  pending_approval: 'Aprovar',
  scheduled: 'Agendado',
  published: 'Publicado',
  archived: 'Arquivado',
};

export function nextVersionNumber(versions: { version: number }[]): number {
  return versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}
