import { describe, expect, it } from 'vitest';
import {
  getCityCoordinates,
  calculateCenterCoordinates,
  KNOWN_CITIES,
  BAIXADA_SANTISTA_CITIES,
} from './cities';

describe('cities helper', () => {
  it('returns coordinates for known city', () => {
    expect(getCityCoordinates('Santos, SP')).toEqual([-23.9608, -46.3336]);
    expect(getCityCoordinates('são vicente, sp')).toEqual([-23.9631, -46.3919]);
  });

  it('matches prefix or fallback', () => {
    expect(getCityCoordinates('Praia Grande')).toEqual([-24.0058, -46.4028]);
    expect(getCityCoordinates('Cidade Desconhecida')).toEqual([-23.9608, -46.3336]);
  });

  it('calculates center coordinates accurately', () => {
    const center = calculateCenterCoordinates(['Santos, SP', 'São Vicente, SP']);
    expect(center[0]).toBeCloseTo((-23.9608 - 23.9631) / 2, 4);
    expect(center[1]).toBeCloseTo((-46.3336 - 46.3919) / 2, 4);
  });

  it('handles empty city list by returning Santos default', () => {
    expect(calculateCenterCoordinates([])).toEqual([-23.9608, -46.3336]);
  });

  it('has Baixada Santista cities defined', () => {
    expect(BAIXADA_SANTISTA_CITIES.length).toBeGreaterThan(3);
    for (const c of BAIXADA_SANTISTA_CITIES) {
      expect(KNOWN_CITIES[c]).toBeDefined();
    }
  });
});
