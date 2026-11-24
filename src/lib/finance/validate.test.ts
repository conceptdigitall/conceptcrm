import { describe, expect, it } from 'vitest';
import {
  parseCategoryInput,
  parseEntryInput,
  parseOneTimeIncomeInput,
  parseRecurringInput,
} from './validate';

describe('parseOneTimeIncomeInput', () => {
  const base = {
    kind: 'income',
    description: 'Site cliente Y',
    category_id: 'c1',
    amount: '5.000',
    currency: 'BRL',
    next_date: '2026-11-20',
    cycle: 'once',
  };

  it('pagamento único sem mensal', () => {
    expect(parseOneTimeIncomeInput({ ...base, has_monthly: false })).toEqual({
      ok: true,
      value: {
        description: 'Site cliente Y',
        category_id: 'c1',
        amount_cents: 500000,
        currency: 'BRL',
        date: '2026-11-20',
        notes: null,
        monthly: null,
      },
    });
  });

  it('pagamento único com cobrança mensal', () => {
    const r = parseOneTimeIncomeInput({
      ...base,
      has_monthly: true,
      monthly_amount: '300,00',
      monthly_start: '2026-12-20',
    });
    expect(r.ok && r.value.monthly).toEqual({
      amount_cents: 30000,
      start_date: '2026-12-20',
    });
  });

  it('recusa gasto, mensal sem valor ou sem data', () => {
    expect(parseOneTimeIncomeInput({ ...base, kind: 'expense' }).ok).toBe(
      false
    );
    expect(
      parseOneTimeIncomeInput({
        ...base,
        has_monthly: true,
        monthly_amount: '',
        monthly_start: '2026-12-20',
      }).ok
    ).toBe(false);
    expect(
      parseOneTimeIncomeInput({
        ...base,
        has_monthly: true,
        monthly_amount: '300',
      }).ok
    ).toBe(false);
  });
});

describe('parseEntryInput', () => {
  const base = {
    kind: 'expense',
    description: ' ChatGPT ',
    category_id: 'c1',
    amount: '20,00',
    currency: 'USD',
    date: '2026-11-05',
  };

  it('aceita um lançamento completo', () => {
    const r = parseEntryInput({ ...base, actual_brl: '124,00', notes: '' });
    expect(r).toEqual({
      ok: true,
      value: {
        kind: 'expense',
        description: 'ChatGPT',
        category_id: 'c1',
        amount_cents: 2000,
        currency: 'USD',
        date: '2026-11-05',
        actual_brl_cents: 12400,
        notes: null,
      },
    });
  });

  it('recusa valor zero, moeda fora da lista e data inválida', () => {
    expect(parseEntryInput({ ...base, amount: '0' }).ok).toBe(false);
    expect(parseEntryInput({ ...base, currency: 'XYZ' }).ok).toBe(false);
    expect(parseEntryInput({ ...base, date: '2026-02-31' }).ok).toBe(false);
    expect(parseEntryInput({ ...base, manual_rate: '-1' }).ok).toBe(false);
  });

  it('no PATCH aceita só os campos enviados', () => {
    expect(parseEntryInput({ actual_brl: null }, true)).toEqual({
      ok: true,
      value: { actual_brl_cents: null },
    });
    expect(parseEntryInput({ manual_rate: '5,5' }, true)).toEqual({
      ok: true,
      value: { manual_rate: 5.5 },
    });
  });
});

describe('parseCategoryInput', () => {
  it('exige nome, tipo e cor válidos', () => {
    expect(
      parseCategoryInput({
        name: 'Anúncios',
        kind: 'expense',
        color: '#FF0000',
      })
    ).toEqual({
      ok: true,
      value: { name: 'Anúncios', kind: 'expense', color: '#ff0000' },
    });
    expect(
      parseCategoryInput({ name: '', kind: 'expense', color: '#ff0000' }).ok
    ).toBe(false);
    expect(
      parseCategoryInput({ name: 'x', kind: 'expense', color: 'red' }).ok
    ).toBe(false);
    expect(parseCategoryInput({ archived: true }, true)).toEqual({
      ok: true,
      value: { archived: true },
    });
  });
});

describe('parseRecurringInput', () => {
  it('aceita assinatura anual e ignora campos de lançamento', () => {
    const r = parseRecurringInput({
      kind: 'expense',
      description: 'Domínio',
      category_id: null,
      amount: '60',
      currency: 'USD',
      cycle: 'yearly',
      next_date: '2027-01-10',
      actual_brl: '10',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        kind: 'expense',
        description: 'Domínio',
        category_id: null,
        amount_cents: 6000,
        currency: 'USD',
        next_date: '2027-01-10',
        cycle: 'yearly',
      },
    });
  });

  it('recusa ciclo inválido', () => {
    expect(
      parseRecurringInput({
        kind: 'expense',
        description: 'x',
        amount: '1',
        currency: 'BRL',
        cycle: 'weekly',
        next_date: '2027-01-10',
      }).ok
    ).toBe(false);
  });
});
