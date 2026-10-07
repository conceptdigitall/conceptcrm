import { describe, expect, it } from 'vitest';
import { nivelPorLead, nivelPorRegiao } from './regiao';

describe('nivelPorRegiao', () => {
  it('marca como alto os bairros nobres de Santos, com ou sem acento', () => {
    expect(nivelPorRegiao('Santos', 'Gonzaga')).toBe('alto');
    expect(nivelPorRegiao('Santos', 'Ponta da Praia')).toBe('alto');
    expect(nivelPorRegiao('Santos', 'Centro')).toBe('alto');
    expect(nivelPorRegiao('Santos', 'Aparecida')).toBe('alto');
    expect(nivelPorRegiao('Santos', 'Embaré')).toBe('alto');
    expect(nivelPorRegiao('Santos', 'embare')).toBe('alto');
  });

  it('marca o resto como médio, inclusive o Centro de São Vicente', () => {
    expect(nivelPorRegiao('São Vicente', 'Centro')).toBe('médio');
    expect(nivelPorRegiao('Santos', 'Marapé')).toBe('médio');
    expect(nivelPorRegiao('Guarujá', 'Pitangueiras')).toBe('médio');
  });

  it('sem cidade ou bairro não decide', () => {
    expect(nivelPorRegiao('Santos', null)).toBeNull();
    expect(nivelPorRegiao(undefined, 'Gonzaga')).toBeNull();
  });
});

describe('nivelPorLead', () => {
  it('extrai cidade e bairro do complete_address do lead', () => {
    const lead = {
      raw: {
        complete_address: { city: 'Santos', borough: 'Gonzaga' },
      },
    };
    expect(nivelPorLead(lead)).toBe('alto');
  });

  it('retorna null quando o lead não possui endereço estruturado', () => {
    expect(nivelPorLead({})).toBeNull();
    expect(nivelPorLead({ raw: null })).toBeNull();
    expect(nivelPorLead({ raw: { complete_address: null } })).toBeNull();
  });
});
