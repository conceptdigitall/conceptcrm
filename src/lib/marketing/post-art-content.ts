// Texto da arte gerada para posts sem foto/vídeo. Antes o post virava só o
// título num fundo azul (e o Instagram recusava, porque não havia imagem).
// Aqui escolhemos chamada, apoio e CTA curtos; o desenho fica em post-art.tsx.
import type { BusinessNiche, MarketingPost, MarketingSettings } from '@/types';
import { getNichePreset } from '@/lib/marketing/niche-autopilot';

export type ArtFormat = 'feed' | 'story';
export type ArtLayout = 0 | 1 | 2;

export interface ArtContent {
  headline: string;
  support: string;
  cta: string;
  tag: string;
  handle: string;
  brand: string;
  layout: ArtLayout;
}

export const ART_SIZE: Record<ArtFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

const SHORT_CTA: Record<BusinessNiche, string> = {
  barbearia: 'Agende pelo WhatsApp',
  clinica: 'Marque sua avaliação',
  adega: 'Peça pelo WhatsApp',
  estetica: 'Reserve seu horário',
  advocacia: 'Fale com um especialista',
  comercio: 'Garanta o seu',
  agencia: 'Chame no WhatsApp',
  geral: 'Fale com a gente',
};

// "Story Manhã — Pergunta do Dia" é rótulo interno, não chamada.
const INTERNAL_LABEL = /^(story|post)\s+(manhã|tarde|noite|rápido)\s*[—-]\s*/i;
// O piloto prefixa a ideia com "[Nome do Negócio] ".
const BUSINESS_PREFIX = /^\[[^\]]*\]\s*/;

function clip(text: string, max: number): string {
  // Espaço inquebrável em "R$ 65" para o valor não cair sozinho na outra linha.
  const clean = text.replace(/\s+/g, ' ').trim().replace(/R\$ (?=\d)/g, 'R$ ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:!?-]+$/, '')}…`;
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?\n]+[.!?]?/);
  return (match?.[0] ?? text).trim();
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export function buildArtContent(
  post: Pick<MarketingPost, 'id' | 'kind' | 'title' | 'idea' | 'frames'>,
  settings: Pick<MarketingSettings, 'business_name' | 'business_niche' | 'instagram_username'>,
): ArtContent {
  const frameText = post.frames?.[0]?.text?.trim() ?? '';
  const rawHeadline = (frameText || post.title || '').replace(INTERNAL_LABEL, '');
  const headline = clip(rawHeadline || 'Novidade do dia', 90);

  const idea = (post.idea ?? '').replace(BUSINESS_PREFIX, '');
  const sentence = firstSentence(idea);
  const h = headline.toLowerCase().replace(/…$/, '');
  const s = sentence.toLowerCase();
  const repeats = s.startsWith(h) || h.startsWith(s);
  const support = sentence && !repeats ? clip(sentence, 120) : '';

  const niche = settings.business_niche ?? 'geral';
  return {
    headline,
    support,
    cta: SHORT_CTA[niche] ?? SHORT_CTA.geral,
    tag: getNichePreset(niche).label.split('/')[0].trim(),
    handle: `@${(settings.instagram_username || 'conceptdigita.l').replace(/^@/, '')}`,
    brand: settings.business_name?.trim() || 'Concept Digital',
    layout: (hash(post.id) % 3) as ArtLayout,
  };
}

/** Tamanho da chamada pelo comprimento: frase curta grande, longa menor. */
export function headlineSize(headline: string, format: ArtFormat): number {
  const base = format === 'story' ? 104 : 92;
  if (headline.length <= 35) return base;
  if (headline.length <= 60) return Math.round(base * 0.82);
  return Math.round(base * 0.68);
}
