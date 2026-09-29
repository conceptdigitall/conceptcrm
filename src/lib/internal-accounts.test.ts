import { describe, expect, it } from 'vitest';
import { internalAccountIds, isInternalAccount } from './internal-accounts';

describe('internal accounts', () => {
  it('parses a comma-separated list, trimming blanks', () => {
    expect(internalAccountIds(' a , b ,, ')).toEqual(['a', 'b']);
  });
  it('allows only listed accounts', () => {
    expect(isInternalAccount('a', 'a,b')).toBe(true);
    expect(isInternalAccount('c', 'a,b')).toBe(false);
  });
  it('is closed when the variable is unset or empty', () => {
    expect(isInternalAccount('a', undefined)).toBe(false);
    expect(isInternalAccount('a', '')).toBe(false);
    expect(isInternalAccount(null, 'a')).toBe(false);
  });
});
