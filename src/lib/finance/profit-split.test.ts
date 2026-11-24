import { describe, expect, it } from 'vitest';
import { splitProfit } from './profit-split';

describe('splitProfit', () => {
  it('25% de R$ 5.000 entre 3', () => {
    const s = splitProfit({
      balanceCents: 500000,
      incomeCents: 800000,
      base: 'balance',
      percent: 25,
      people: 3,
    });
    expect(s.totalCents).toBe(125000);
    expect(s.shares).toEqual([41667, 41667, 41666]);
    expect(s.shares.reduce((a, b) => a + b, 0)).toBe(125000);
    expect(s.remainingBalanceCents).toBe(375000);
    expect(s.exceedsBalance).toBe(false);
  });

  it('sobre as entradas pode passar da sobra', () => {
    const s = splitProfit({
      balanceCents: 100000,
      incomeCents: 800000,
      base: 'income',
      percent: 25,
      people: 3,
    });
    expect(s.totalCents).toBe(200000);
    expect(s.exceedsBalance).toBe(true);
    expect(s.remainingBalanceCents).toBe(-100000);
  });

  it('mês no prejuízo não gera retirada', () => {
    const s = splitProfit({
      balanceCents: -50000,
      incomeCents: 100000,
      base: 'balance',
      percent: 50,
      people: 3,
    });
    expect(s.totalCents).toBe(0);
    expect(s.shares).toEqual([0, 0, 0]);
  });

  it('limita porcentagem e pessoas', () => {
    expect(
      splitProfit({
        balanceCents: 1000,
        incomeCents: 0,
        base: 'balance',
        percent: 150,
        people: 0,
      })
    ).toMatchObject({
      percent: 100,
      people: 1,
      totalCents: 1000,
      shares: [1000],
    });
    expect(
      splitProfit({
        balanceCents: 1000,
        incomeCents: 0,
        base: 'balance',
        percent: Number.NaN,
        people: 3,
      }).totalCents
    ).toBe(0);
  });
});
