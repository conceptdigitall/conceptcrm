import { describe, expect, it } from 'vitest';
import { formatMoney, isFinanceCurrency, parseMoneyInput, toBrlCents } from './money';

describe('parseMoneyInput', () => {
  it('lê formatos brasileiro e americano', () => {
    expect(parseMoneyInput('1.234,56')).toBe(123456);
    expect(parseMoneyInput('1234,56')).toBe(123456);
    expect(parseMoneyInput('1234.56')).toBe(123456);
    expect(parseMoneyInput('1,234.56')).toBe(123456);
    expect(parseMoneyInput('R$ 20')).toBe(2000);
    expect(parseMoneyInput('19,9')).toBe(1990);
    expect(parseMoneyInput('1.000')).toBe(100000);
    expect(parseMoneyInput(20.5)).toBe(2050);
  });

  it('recusa o que não é valor', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('-10')).toBeNull();
    expect(parseMoneyInput(null)).toBeNull();
    expect(parseMoneyInput(Number.NaN)).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formata em pt-BR com centavos', () => {
    expect(formatMoney(123456, 'BRL').replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatMoney(2000, 'USD').replace(/\s/g, ' ')).toBe('US$ 20,00');
  });

  it('não quebra com código inválido', () => {
    expect(formatMoney(100, 'XX')).toBe('XX 1,00');
  });
});

describe('toBrlCents', () => {
  it('converte e arredonda para o centavo', () => {
    expect(toBrlCents(2000, 5.9346)).toBe(11869);
    expect(toBrlCents(999, 1)).toBe(999);
  });
});

it('isFinanceCurrency aceita só a lista', () => {
  expect(isFinanceCurrency('USD')).toBe(true);
  expect(isFinanceCurrency('usd')).toBe(false);
  expect(isFinanceCurrency('ARS')).toBe(false);
});
