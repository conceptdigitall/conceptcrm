const MAX_SLUG_LEN = 34;
const MAX_WORDS = 5;

// "video-promocao-de-corte-barba-por-2026-10-01.mp4": readable in the
// Downloads folder and safe in a Content-Disposition header (ASCII only).
export function videoFileName(prompt: string, createdAt: string): string {
  const words = prompt
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  const slug = words.join('-').slice(0, MAX_SLUG_LEN).replace(/-+$/, '') || 'fotos';
  return `video-${slug}-${createdAt.slice(0, 10)}.mp4`;
}
