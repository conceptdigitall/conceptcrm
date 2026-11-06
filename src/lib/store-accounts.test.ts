import { describe, expect, it } from 'vitest';
import { isStoreAccount, storeAccountIds } from './store-accounts';

describe('store accounts', () => {
  it('parses a comma-separated list, trimming blanks', () => {
    expect(storeAccountIds(' a , b ,, ')).toEqual(['a', 'b']);
  });
  it('allows only listed accounts', () => {
    expect(isStoreAccount('a', 'a, b')).toBe(true);
    expect(isStoreAccount('c', 'a,b')).toBe(false);
  });
  it('is closed when the variable is unset or the account is missing', () => {
    expect(storeAccountIds(undefined)).toEqual([]);
    expect(isStoreAccount('a', '')).toBe(false);
    expect(isStoreAccount(null, 'a')).toBe(false);
  });
});
