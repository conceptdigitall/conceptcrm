import { describe, expect, it } from 'vitest';
import { FORMAT_SIZE, buildFixPrompt, buildUserPrompt, extractHtml } from './prompt';

describe('buildUserPrompt', () => {
  it('includes the brief, canvas size, tone and image files', () => {
    const p = buildUserPrompt({
      prompt: 'Promo corte + barba R$ 50', format: 'vertical', tone: 'polished',
      imageFiles: ['assets/img-1.jpg', 'assets/img-2.png'],
    });
    expect(p).toContain('Promo corte + barba R$ 50');
    expect(p).toContain('1080x1920');
    expect(p).toContain('polished');
    expect(p).toContain('assets/img-1.jpg');
    expect(p).toContain('assets/img-2.png');
  });
  it('says there are no images when none were sent', () => {
    expect(buildUserPrompt({ prompt: 'a', format: 'square', tone: 'default', imageFiles: [] }))
      .toContain('Nenhuma foto');
  });
});

describe('FORMAT_SIZE', () => {
  it('maps formats to canvas sizes', () => {
    expect(FORMAT_SIZE.landscape).toEqual({ width: 1920, height: 1080 });
  });
});

describe('extractHtml', () => {
  it('extracts the fenced html block', () => {
    expect(extractHtml('texto\n```html\n<html><body>x</body></html>\n```\nfim'))
      .toBe('<html><body>x</body></html>');
  });
  it('accepts a bare html document', () => {
    expect(extractHtml('<!doctype html><html></html>')).toBe('<!doctype html><html></html>');
  });
  it('returns null when there is no html', () => {
    expect(extractHtml('Desculpe, não posso.')).toBeNull();
  });
});

describe('buildFixPrompt', () => {
  it('embeds the tail of the check output', () => {
    const p = buildFixPrompt('a'.repeat(10000) + 'ERRO FINAL');
    expect(p).toContain('ERRO FINAL');
    expect(p.length).toBeLessThan(7000);
  });
});
