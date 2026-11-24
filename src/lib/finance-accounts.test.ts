import { describe, expect, it } from 'vitest';

import { isFinanceAccount } from './finance-accounts';

describe('isFinanceAccount', () => {
  it('usa a lista própria quando preenchida', () => {
    expect(isFinanceAccount('a', 'a,b', 'c')).toBe(true);
    expect(isFinanceAccount('c', 'a,b', 'c')).toBe(false);
  });
  it('sem lista própria, vale a lista de contas internas', () => {
    expect(isFinanceAccount('c', '', 'c, d')).toBe(true);
    expect(isFinanceAccount('x', undefined, 'c')).toBe(false);
  });
  it('as duas vazias = ninguém', () => {
    expect(isFinanceAccount('a', '', '')).toBe(false);
    expect(isFinanceAccount(null, 'a', 'a')).toBe(false);
  });
});
