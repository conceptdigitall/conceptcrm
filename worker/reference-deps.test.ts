import { describe, expect, it } from 'vitest';
import { isQuotaError, parseDuration, parseYtDlpDuration } from './reference-deps';

describe('parseYtDlpDuration', () => {
  it('lê a duração em segundos', () => {
    expect(parseYtDlpDuration('{"duration": 42.5}')).toBe(42.5);
  });
  it('lança sem duration, negativa ou inválida', () => {
    expect(() => parseYtDlpDuration('{"title": "x"}')).toThrow();
    expect(() => parseYtDlpDuration('{"duration": -1}')).toThrow();
    expect(() => parseYtDlpDuration('{"duration": null}')).toThrow();
    expect(() => parseYtDlpDuration('{"duration": "abc"}')).toThrow();
    expect(() => parseYtDlpDuration('não é json')).toThrow();
  });
});

describe('parseDuration (ffprobe)', () => {
  it('lê o número impresso pelo ffprobe', () => {
    expect(parseDuration('12.345\n')).toBe(12.345);
  });
  it('lança em NaN, vazio ou negativo', () => {
    expect(() => parseDuration('N/A')).toThrow();
    expect(() => parseDuration('')).toThrow();
    expect(() => parseDuration('-3')).toThrow();
    expect(() => parseDuration('NaN')).toThrow();
  });
});

describe('isQuotaError', () => {
  it('reconhece status 429 e RESOURCE_EXHAUSTED', () => {
    expect(isQuotaError(Object.assign(new Error('x'), { status: 429 }))).toBe(true);
    expect(isQuotaError(new Error('429 RESOURCE_EXHAUSTED: quota'))).toBe(true);
  });
  it('não confunde com outros erros', () => {
    expect(isQuotaError(Object.assign(new Error('boom'), { status: 500 }))).toBe(false);
    expect(isQuotaError('x')).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});
