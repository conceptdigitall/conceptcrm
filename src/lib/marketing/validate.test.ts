import { describe, expect, it } from 'vitest';
import { validatePhotoPaths, validateVideoInput } from './validate';
import { DEFAULT_VIDEO_OPTIONS } from './video-options';

const acc = 'acc-1';
const img = (n: number) => `account-${acc}/uploads/1-foto${n}.jpg`;

describe('validateVideoInput', () => {
  it('keeps style, duration and forces 9:16 for stories', () => {
    const r = validateVideoInput({ prompt: 'Story', format: 'landscape', style: 'whiteboard', duration: 45, target: 'story' }, acc);
    expect(r.ok && r.value.format).toBe('vertical');
    expect(r.ok && r.value.options).toEqual({ style: 'whiteboard', duration: 45, target: 'story' });
  });
  it('falls back to defaults on unknown style or duration', () => {
    const r = validateVideoInput({ prompt: 'x', style: 'hack', duration: 999 }, acc);
    expect(r.ok && r.value.options).toEqual(DEFAULT_VIDEO_OPTIONS);
  });
  it('accepts prompt + images and applies defaults', () => {
    expect(validateVideoInput({ prompt: ' Promo corte + barba R$50 ', imagePaths: [img(1)] }, acc)).toEqual({
      ok: true,
      value: { prompt: 'Promo corte + barba R$50', imagePaths: [img(1)], format: 'vertical', tone: 'default', options: DEFAULT_VIDEO_OPTIONS },
    });
  });
  it('accepts no images', () => {
    expect(validateVideoInput({ prompt: 'Abertura', imagePaths: [] }, acc).ok).toBe(true);
  });
  it('rejects an empty prompt when there are no photos', () => {
    expect(validateVideoInput({ prompt: '  ' }, acc)).toEqual({
      ok: false, error: 'Escreva uma descrição ou envie pelo menos 1 foto',
    });
  });
  it('accepts photos without a description (video made only from the photos)', () => {
    expect(validateVideoInput({ imagePaths: [img(1), img(2)] }, acc)).toEqual({
      ok: true,
      value: { prompt: '', imagePaths: [img(1), img(2)], format: 'vertical', tone: 'default', options: DEFAULT_VIDEO_OPTIONS },
    });
  });
  it('rejects too long prompts', () => {
    expect(validateVideoInput({ prompt: 'x'.repeat(1001) }, acc).ok).toBe(false);
  });
  it('rejects more than 4 images', () => {
    expect(validateVideoInput({ prompt: 'a', imagePaths: [1, 2, 3, 4, 5].map(img) }, acc).ok).toBe(false);
  });
  it("rejects image paths outside the caller's account folder", () => {
    expect(validateVideoInput({ prompt: 'a', imagePaths: ['account-other/uploads/x.jpg'] }, acc).ok).toBe(false);
    expect(validateVideoInput({ prompt: 'a', imagePaths: [`account-${acc}/../x.jpg`] }, acc).ok).toBe(false);
  });
  it('rejects unknown format and tone', () => {
    expect(validateVideoInput({ prompt: 'a', format: 'tiktok' }, acc).ok).toBe(false);
    expect(validateVideoInput({ prompt: 'a', tone: 'chaotic' }, acc).ok).toBe(false);
  });
});

describe('validatePhotoPaths', () => {
  const acc = 'acc-1';
  it('aceita caminhos da pasta de uploads da própria conta', () => {
    expect(validatePhotoPaths([`account-${acc}/uploads/1-a.jpg`], acc)).toBeNull();
  });
  it('recusa pasta de outra conta, .. e valores que não são texto', () => {
    expect(validatePhotoPaths(['account-other/uploads/x.jpg'], acc)).toBe('Foto inválida');
    expect(validatePhotoPaths([`account-${acc}/uploads/../x.jpg`], acc)).toBe('Foto inválida');
    expect(validatePhotoPaths([42], acc)).toBe('Foto inválida');
  });
  it('recusa quando não é uma lista', () => {
    expect(validatePhotoPaths('account-acc-1/uploads/x.jpg', acc)).toBe('Foto inválida');
  });
});
