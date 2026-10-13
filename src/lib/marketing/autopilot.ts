// Piloto automático de marketing: a cada semana o worker cria sozinho
// N posts de feed e M stories (vídeo, arte estática e legenda), sempre como
// rascunho até a mídia ficar pronta e depois "esperando aprovação". Nada é
// publicado sem o João aprovar no painel.
//
// Este arquivo é só regra pura (agenda, pauta, parse); quem grava no banco é
// `worker/autopilot.ts`.
import type { MarketingSettings, PostKind, PostMediaType, VideoFormat, VideoTone } from '@/types';
import { activeHashtags } from './content';
import type { VideoOptions, VideoStyle } from './video-options';

export interface AutopilotConfig {
  feedPerWeek: number;
  storiesPerWeek: number;
}

export const AUTOPILOT_DEFAULTS: AutopilotConfig = { feedPerWeek: 3, storiesPerWeek: 5 };

export function autopilotConfigFromEnv(env: Record<string, string | undefined>): AutopilotConfig | null {
  if (env.MARKETING_AUTOPILOT !== '1') return null;
  const n = (v: string | undefined, fallback: number) => {
    const x = Number(v);
    return Number.isInteger(x) && x >= 0 && x <= 21 ? x : fallback;
  };
  return {
    feedPerWeek: n(env.AUTOPILOT_FEED_PER_WEEK, AUTOPILOT_DEFAULTS.feedPerWeek),
    storiesPerWeek: n(env.AUTOPILOT_STORIES_PER_WEEK, AUTOPILOT_DEFAULTS.storiesPerWeek),
  };
}

// Brasília não tem horário de verão desde 2019: UTC-3 fixo.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Segunda-feira 00:00 de Brasília da semana de `now`, como instante UTC. */
export function weekStart(now: Date): Date {
  const local = new Date(now.getTime() - BRT_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysSinceMonday * DAY_MS;
  return new Date(mondayLocal + BRT_OFFSET_MS);
}

/** Quantos itens já deveriam existir até hoje, espalhando a meta pelos 7 dias. */
export function dueCount(target: number, now: Date): number {
  const day = Math.min(6, Math.floor((now.getTime() - weekStart(now).getTime()) / DAY_MS));
  return Math.min(target, Math.ceil((target * (day + 1)) / 7));
}

export interface AutopilotSlot {
  kind: PostKind;
  mediaType: PostMediaType;
  format: VideoFormat;
  tone: VideoTone;
  options: VideoOptions & { autopilot: true };
}

// Estilos e tons giram para a grade não ficar repetida.
const STYLE_CYCLE: VideoStyle[] = ['kinetic', 'whiteboard', 'cutout', 'contador'];
const TONE_CYCLE: VideoTone[] = ['default', 'app-store', 'polished', 'cinematic'];

/**
 * Próximo item a criar agora, ou null se a semana está em dia.
 * Feed: o 1º de cada 3 é Reel (vídeo 30 s), os outros são arte estática.
 * Stories: vídeo 9:16 de 15 s.
 */
export function nextSlot(
  cfg: AutopilotConfig, made: { feed: number; story: number }, now: Date,
): AutopilotSlot | null {
  const feedBehind = dueCount(cfg.feedPerWeek, now) - made.feed;
  const storyBehind = dueCount(cfg.storiesPerWeek, now) - made.story;
  if (feedBehind <= 0 && storyBehind <= 0) return null;

  const n = made.feed + made.story;
  const style = STYLE_CYCLE[n % STYLE_CYCLE.length];
  const tone = TONE_CYCLE[n % TONE_CYCLE.length];

  if (feedBehind >= storyBehind) {
    if (made.feed % 3 === 0) {
      return {
        kind: 'feed', mediaType: 'video', format: 'vertical', tone,
        options: { style, duration: 30, target: 'reels', autopilot: true },
      };
    }
    return {
      kind: 'feed', mediaType: 'foto', format: 'square', tone,
      options: { style, duration: 15, target: 'reels', still: true, autopilot: true },
    };
  }
  return {
    kind: 'story', mediaType: 'video', format: 'vertical', tone,
    options: { style, duration: 15, target: 'story', autopilot: true },
  };
}

export const AUTOPILOT_SYSTEM =
  'Você é o estrategista de conteúdo do Instagram da Concept Digital (sites, recepcionista de IA no WhatsApp e marketing com IA para pequenos negócios). Responda só com JSON válido.';

export function autopilotPrompt(input: {
  slot: AutopilotSlot;
  settings: Pick<MarketingSettings, 'caption_style' | 'caption_size' | 'emoji_level' | 'cta' | 'never_use' | 'hashtags' | 'instagram_username'>;
  projects: string[];
  recentTitles: string[];
}): string {
  const { slot, settings: s } = input;
  const what = slot.kind === 'story'
    ? `um story em vídeo de ${slot.options.duration} s (9:16)`
    : slot.mediaType === 'video'
      ? `um Reel de ${slot.options.duration} s`
      : 'um post de foto (arte estática com título forte)';
  const tags = activeHashtags(s.hashtags).join(' ');
  return [
    `Crie a pauta de ${what} para o Instagram @${s.instagram_username || 'conceptdigita.l'}.`,
    input.projects.length ? `Projetos reais que podem aparecer: ${input.projects.join('; ')}.` : '',
    input.recentTitles.length ? `Já saiu recentemente (não repita o tema): ${input.recentTitles.join(' | ')}.` : '',
    '',
    'Responda com um objeto JSON com exatamente estas chaves:',
    '- "title": título curto do post na grade (até 40 caracteres).',
    '- "brief": briefing para o designer do vídeo/arte, até 600 caracteres: gancho, mensagem principal e CTA. Só fatos gerais da Concept; não invente preço, cliente ou número.',
    `- "caption": legenda pronta do Instagram em português do Brasil. Estilo ${s.caption_style}, tamanho ${s.caption_size}, emojis ${s.emoji_level}.`
      + (s.cta ? ` Termine com o CTA: ${s.cta}.` : '')
      + (s.never_use ? ` Nunca use: ${s.never_use}.` : '')
      + (tags ? ` Feche com as hashtags: ${tags}.` : ''),
  ].filter(Boolean).join('\n');
}

export interface AutopilotIdea { title: string; brief: string; caption: string }

/** Lê o JSON da IA (com ou sem cerca ```json); null se faltar campo. */
export function parseAutopilotIdea(raw: string): AutopilotIdea | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 60) : '';
    const brief = typeof o.brief === 'string' ? o.brief.trim().slice(0, 1000) : '';
    const caption = typeof o.caption === 'string' ? o.caption.trim().slice(0, 2200) : '';
    if (!title || !brief || !caption) return null;
    return { title, brief, caption };
  } catch {
    return null;
  }
}
