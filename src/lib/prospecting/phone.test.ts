import { describe, expect, it } from 'vitest';
import { isBrMobile, normalizeBrPhone, phoneLookupVariants } from './phone';

describe('normalizeBrPhone', () => {
  it('adds 55 to a formatted mobile', () => {
    expect(normalizeBrPhone('(13) 99123-4567')).toBe('5513991234567');
  });
  it('keeps an existing 55 prefix', () => {
    expect(normalizeBrPhone('+55 13 3222-1111')).toBe('551332221111');
  });
  it('drops a leading trunk zero', () => {
    expect(normalizeBrPhone('013 99123-4567')).toBe('5513991234567');
  });
  it('rejects 0800 and short or empty numbers', () => {
    expect(normalizeBrPhone('0800 123 4567')).toBeNull();
    expect(normalizeBrPhone('1234')).toBeNull();
    expect(normalizeBrPhone('')).toBeNull();
    expect(normalizeBrPhone(null)).toBeNull();
  });
});

describe('isBrMobile', () => {
  it('is true for 9-digit numbers starting with 9', () => {
    expect(isBrMobile('5513991234567')).toBe(true);
  });
  it('is false for landlines and null', () => {
    expect(isBrMobile('551332221111')).toBe(false);
    expect(isBrMobile(null)).toBe(false);
  });
});

describe('phoneLookupVariants', () => {
  it('adds the WhatsApp form without the ninth digit for mobiles', () => {
    expect(phoneLookupVariants('5513991234567')).toEqual(['5513991234567', '551391234567']);
  });
  it('keeps landlines as-is', () => {
    expect(phoneLookupVariants('551332221111')).toEqual(['551332221111']);
  });
});
