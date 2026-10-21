// Direção do vídeo escolhida no painel (estilo de edição, duração, Reels ou
// Story). Vai para `marketing_videos.director_input` (jsonb que já existe),
// então não precisa de migração; o worker lê com `parseVideoOptions`.
// Vídeos de pacote de nicho usam o mesmo campo com `buttonId` e seguem outro
// caminho no worker (`template_id`), sem conflito.

export type VideoStyle = 'auto' | 'kinetic' | 'whiteboard' | 'cutout' | 'contador' | 'fotos';
export type VideoDuration = 15 | 30 | 45 | 60;
export type VideoTarget = 'reels' | 'story';

export interface VideoOptions {
  style: VideoStyle;
  duration: VideoDuration;
  target: VideoTarget;
  /** Arte estática (post de foto): o worker renderiza e usa só o frame 0, sem áudio. */
  still?: boolean;
}

export const VIDEO_STYLES: { value: VideoStyle; label: string; hint: string }[] = [
  { value: 'auto', label: 'IA escolhe', hint: 'A IA decide pelo assunto' },
  { value: 'kinetic', label: 'Texto animado', hint: 'Frases grandes no ritmo da fala' },
  { value: 'whiteboard', label: 'Lousa desenhada', hint: 'Mão desenhando o processo' },
  { value: 'cutout', label: 'Colagem de prints', hint: 'Prints recortados, estilo roast' },
  { value: 'contador', label: 'Números e dados', hint: 'Contadores e resultados subindo' },
  { value: 'fotos', label: 'Fotos em destaque', hint: 'Suas fotos com zoom e cortes' },
];

export const VIDEO_DURATIONS: VideoDuration[] = [15, 30, 45, 60];

export const DEFAULT_VIDEO_OPTIONS: VideoOptions = { style: 'auto', duration: 15, target: 'reels' };

const STYLE_VALUES = VIDEO_STYLES.map((s) => s.value);

/** Lê as opções de um corpo de request ou do `director_input`; valor estranho vira o padrão. */
export function parseVideoOptions(raw: unknown): VideoOptions {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const style = STYLE_VALUES.includes(o.style as VideoStyle) ? (o.style as VideoStyle) : DEFAULT_VIDEO_OPTIONS.style;
  const duration = VIDEO_DURATIONS.includes(Number(o.duration) as VideoDuration)
    ? (Number(o.duration) as VideoDuration)
    : DEFAULT_VIDEO_OPTIONS.duration;
  const target: VideoTarget = o.target === 'story' ? 'story' : 'reels';
  return o.still === true ? { style, duration, target, still: true } : { style, duration, target };
}

/** Palavras de narração que cabem na duração (~2,4 palavras/s, com respiro no fim). */
export function narrationWordLimit(duration: number): number {
  return Math.max(24, Math.round((duration - 3) * 2.4));
}
