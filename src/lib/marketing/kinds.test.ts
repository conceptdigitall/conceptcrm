import { describe, expect, it } from 'vitest';
import { isKindFormatValid } from './kinds';

describe('isKindFormatValid', () => {
  it('reels aceita vertical (9:16) e quadrado (1:1)', () => {
    expect(isKindFormatValid('reels', 'vertical')).toBe(true);
    expect(isKindFormatValid('reels', 'square')).toBe(true);
  });
  it('reels recusa horizontal', () => {
    expect(isKindFormatValid('reels', 'landscape')).toBe(false);
  });
  it('resumo aceita só horizontal (16:9)', () => {
    expect(isKindFormatValid('resumo', 'landscape')).toBe(true);
    expect(isKindFormatValid('resumo', 'vertical')).toBe(false);
    expect(isKindFormatValid('resumo', 'square')).toBe(false);
  });
});
