import { describe, expect, it } from 'vitest';
import { MAX_PHOTOS, mergePhotos } from './photos';

const photo = (name: string, type = 'image/jpeg', size = 1000) => ({ name, type, size, lastModified: 1 });

describe('mergePhotos', () => {
  it('adds new photos after the ones already picked', () => {
    expect(mergePhotos([photo('a.jpg')], [photo('b.png', 'image/png')])).toEqual({
      photos: [photo('a.jpg'), photo('b.png', 'image/png')], error: null,
    });
  });
  it('ignores the same file picked twice', () => {
    expect(mergePhotos([photo('a.jpg')], [photo('a.jpg')]).photos).toHaveLength(1);
  });
  it(`keeps the first ${4} and says so when there are too many`, () => {
    const r = mergePhotos([photo('1.jpg'), photo('2.jpg'), photo('3.jpg')], [photo('4.jpg'), photo('5.jpg')]);
    expect(r.photos.map((p) => p.name)).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg']);
    expect(r.error).toBe(`No máximo ${MAX_PHOTOS} fotos: ficaram as 4 primeiras`);
  });
  it('skips files of the wrong type or over 5 MB and names them', () => {
    const r = mergePhotos([], [photo('ok.webp', 'image/webp'), photo('doc.pdf', 'application/pdf'), photo('big.jpg', 'image/jpeg', 6 * 1024 * 1024)]);
    expect(r.photos.map((p) => p.name)).toEqual(['ok.webp']);
    expect(r.error).toBe('Use JPG, PNG ou WebP de até 5 MB: doc.pdf, big.jpg');
  });
  it('aceita um máximo diferente quando o template pede mais fotos', () => {
    const many = Array.from({ length: 12 }, (_, i) => photo(`${i}.jpg`));
    const r = mergePhotos([], many, 10);
    expect(r.photos).toHaveLength(10);
    expect(r.error).toBe('No máximo 10 fotos: ficaram as 10 primeiras');
  });
});
