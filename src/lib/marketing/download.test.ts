import { describe, expect, it } from 'vitest';
import { videoFileName } from './download';

describe('videoFileName', () => {
  it('uses the first words of the description, without accents, plus the date', () => {
    expect(videoFileName('Promoção de corte + barba por R$ 50 nesta sexta!', '2026-10-01T15:00:00Z'))
      .toBe('video-promocao-de-corte-barba-por-2026-10-01.mp4');
  });
  it('falls back to "fotos" when there is no description', () => {
    expect(videoFileName('', '2026-10-01T15:00:00Z')).toBe('video-fotos-2026-10-01.mp4');
    expect(videoFileName('!!! ???', '2026-10-01T15:00:00Z')).toBe('video-fotos-2026-10-01.mp4');
  });
  it('keeps the name short', () => {
    const name = videoFileName('a'.repeat(300), '2026-10-01T15:00:00Z');
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.endsWith('-2026-10-01.mp4')).toBe(true);
  });
});
