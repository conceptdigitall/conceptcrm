// Preenche uma composição HyperFrames (HTML) com os dados do vídeo.
// Substituição determinística, sem lógica no template: mesma entrada, mesmo HTML.
//
// Sintaxe: {{width}} {{height}} {{totalSec}} {{introSec}} {{outroSec}}
//          {{text.<chave>}}  (escapado)
//          {{#photos}} … {{/photos}}  repetido por foto, com {{i}} {{start}} {{dur}} {{src}}

export interface Timeline {
  introSec: number;
  perPhotoSec: number;
  outroSec: number;
  totalSec: number;
}

export interface RenderData {
  width: number;
  height: number;
  texts: Record<string, string>;
  photos: string[];
  timeline: Timeline;
}

const INTRO_SEC = 2;
const OUTRO_SEC = 3;
const TARGET_SEC = 20;
const MIN_TOTAL_SEC = 15;
const MIN_PER_PHOTO = 1.2;
const MAX_PER_PHOTO = 3.5;

export function planTimeline(photoCount: number): Timeline {
  const fixed = INTRO_SEC + OUTRO_SEC;
  const ideal = Math.min(MAX_PER_PHOTO, Math.max(MIN_PER_PHOTO, (TARGET_SEC - fixed) / photoCount));
  // Poucas fotos: estende cada cena para o vídeo não ficar abaixo de 15 s.
  const perPhotoSec = Math.max(ideal, (MIN_TOTAL_SEC - fixed) / photoCount);
  return { introSec: INTRO_SEC, perPhotoSec, outroSec: OUTRO_SEC, totalSec: fixed + photoCount * perPhotoSec };
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
const num = (n: number) => String(+n.toFixed(3));

function fill(template: string, scope: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (!(key in scope)) throw new Error(`Placeholder desconhecido no template: {{${key}}}`);
    return scope[key];
  });
}

export function renderComposition(html: string, data: RenderData): string {
  const { timeline } = data;
  const globals: Record<string, string> = {
    width: num(data.width),
    height: num(data.height),
    totalSec: num(timeline.totalSec),
    introSec: num(timeline.introSec),
    outroSec: num(timeline.outroSec),
  };
  for (const [k, v] of Object.entries(data.texts)) globals[`text.${k}`] = escapeHtml(v);

  const withPhotos = html.replace(/\{\{#photos\}\}([\s\S]*?)\{\{\/photos\}\}/g, (_, inner: string) =>
    data.photos
      .map((src, idx) =>
        fill(inner, {
          ...globals,
          i: String(idx + 1),
          start: num(timeline.introSec + idx * timeline.perPhotoSec),
          dur: num(timeline.perPhotoSec),
          src: escapeHtml(src),
        }),
      )
      .join(''),
  );
  return fill(withPhotos, globals);
}
