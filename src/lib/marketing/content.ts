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
  business_name: '',
  business_niche: 'geral',
  caption_style: 'direto',
  caption_size: 'media',
  emoji_level: 'poucos',
  cta: 'Chama no direct e pede seu diagnóstico grátis.',
  never_use: 'promessas de resultado garantido, preço',
  hashtags: DEFAULT_HASHTAGS,
  require_approval: true,
  approver_whatsapp: '',
  daily_schedule_time: '08:30',
  autopilot_frequency: 'diario',
  tutorial_completed: false,
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
  s: Pick<MarketingSettings, 'caption_style' | 'caption_size' | 'emoji_level' | 'cta' | 'hashtags' | 'business_name'>,
  idea: string,
  size: CaptionSize = s.caption_size,
): string {
  let body = STYLE_WRAP[s.caption_style](idea.trim());
  if (size === 'curta') body = firstSentence(body);
  const parts = [body + EMOJI[s.emoji_level]];
  if (size === 'longa') {
    const brandLine = s.business_name?.trim()
      ? `Aqui em ${s.business_name.trim()}, cuidamos de cada detalhe para você ter a melhor experiência.`
      : 'Na Concept, site, CRM e automação trabalham juntos.';
    parts.push(brandLine);
  }
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

/** Ideias prontas para o modal de criar post: um toque preenche a ideia e já gera as legendas. */
export const IDEA_PRESETS: { label: string; idea: string }[] = [
  { label: 'Erro que custa clientes', idea: 'Pequenos negócios perdem vendas por demorar mais de 10 minutos para responder no WhatsApp.' },
  { label: 'Antes e depois', idea: 'Como um site profissional mudou a forma como o cliente encontra e confia na empresa.' },
  { label: 'Dica rápida', idea: '3 automações simples que economizam horas de atendimento por semana.' },
  { label: 'Bastidores', idea: 'Um dia de projeto na Concept Digital: do briefing ao site no ar.' },
  { label: 'Prova social', idea: 'Resultado real de um cliente depois de organizar o atendimento com CRM e IA.' },
];

/** Três legendas locais (sem IA), uma por estilo, começando pelo estilo salvo nos Ajustes. */
export function buildCaptionOptions(
  s: Pick<MarketingSettings, 'caption_style' | 'caption_size' | 'emoji_level' | 'cta' | 'hashtags' | 'business_name'>,
  idea: string,
): string[] {
  const order = [s.caption_style, ...CAPTION_STYLES.map((c) => c.value).filter((v) => v !== s.caption_style)];
  return order.slice(0, 3).map((style) => buildCaption({ ...s, caption_style: style }, idea));
}

export const CAPTION_OPTION_SEPARATOR = '---';

export function captionSystemPrompt(
  s: Pick<MarketingSettings, 'caption_style' | 'caption_size' | 'emoji_level' | 'cta' | 'never_use' | 'hashtags' | 'business_name' | 'business_niche'>,
): string {
  const tags = activeHashtags(s.hashtags).join(' ');
  const brand = s.business_name?.trim()
    ? `para a empresa "${s.business_name.trim()}" (ramo: ${s.business_niche || 'geral'})`
    : 'para a Concept Digital (sites, CRM e automação com IA)';
  return [
    `Você escreve legendas de Instagram em português do Brasil ${brand}.`,
    'Escreva exatamente 3 legendas diferentes para a ideia recebida, cada uma com um gancho distinto na primeira linha.',
    `Estilo preferido: ${s.caption_style}. Tamanho: ${s.caption_size}. Emojis: ${s.emoji_level}.`,
    s.cta.trim() ? `Termine cada legenda com esta chamada: "${s.cta.trim()}".` : '',
    s.never_use.trim() ? `Nunca use: ${s.never_use.trim()}.` : '',
    tags ? `Na última linha de cada legenda, use estas hashtags: ${tags}` : '',
    `Separe as legendas com uma linha contendo apenas ${CAPTION_OPTION_SEPARATOR}. Não numere, não use markdown, não escreva nada além das legendas.`,
  ].filter(Boolean).join('\n');
}

export function parseCaptionOptions(raw: string): string[] {
  return raw
    .split(/^\s*-{3,}\s*$/m)
    .map((p) => p.trim())
    .filter((p) => p.length > 20)
    .slice(0, 3);
}
