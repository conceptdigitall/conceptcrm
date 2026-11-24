import { describe, expect, it } from 'vitest';
import { addDays, addMonths, isIsoDate, isMonthKey, monthRange, shiftMonth, todayInBrazil } from './dates';

describe('datas', () => {
  it('valida datas de verdade', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('26-02-01')).toBe(false);
    expect(isMonthKey('2026-12')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
  });

  it('soma meses prendendo no fim do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonths('2026-03-10', 12)).toBe('2027-03-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('soma dias e dá o intervalo do mês', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('usa o fuso de São Paulo para hoje', () => {
    // 02:00 UTC do dia 21 ainda é dia 20 em São Paulo (UTC-3).
    expect(todayInBrazil(new Date('2026-11-21T02:00:00Z'))).toBe('2026-11-20');
  });
});
