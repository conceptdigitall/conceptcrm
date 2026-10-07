import { describe, it, expect } from 'vitest';
import {
  NicheKey,
  NICHES,
  AVAILABLE_NICHES,
  getNicheConfig,
  isValidNiche,
} from './niches';

describe('niches config', () => {
  const expectedKeys: NicheKey[] = [
    'concept',
    'advogado',
    'clinica',
    'fotografo',
    'barbeiro',
    'ecommerce',
    'imobiliaria',
  ];

  it('contains all 7 supported niches', () => {
    expect(Object.keys(NICHES)).toEqual(expect.arrayContaining(expectedKeys));
    expect(AVAILABLE_NICHES).toHaveLength(expectedKeys.length);
  });

  it('guarantees architectural isolation: only concept has Maps scraper enabled', () => {
    expect(NICHES.concept.hasMapsScraper).toBe(true);
    const clientNiches = expectedKeys.filter((k) => k !== 'concept');
    for (const key of clientNiches) {
      expect(NICHES[key].hasMapsScraper).toBe(false);
    }
  });

  it('provides specific return cycle days for each vertical niche', () => {
    expect(NICHES.barbeiro.defaultReactivationDays).toBe(21);
    expect(NICHES.clinica.defaultReactivationDays).toBe(90);
    expect(NICHES.fotografo.defaultReactivationDays).toBe(60);
    expect(NICHES.advogado.defaultReactivationDays).toBe(180);
    expect(NICHES.ecommerce.defaultReactivationDays).toBe(30);
    expect(NICHES.imobiliaria.defaultReactivationDays).toBe(60);
  });

  it('provides contextual field labels for playbooks and UI', () => {
    expect(NICHES.barbeiro.fieldLabels.serviceLabel).toBe('Corte / Barba');
    expect(NICHES.clinica.fieldLabels.serviceLabel).toBe('Procedimento / Consulta');
    expect(NICHES.advogado.fieldLabels.serviceLabel).toBe('Área / Causa');
    expect(NICHES.fotografo.fieldLabels.serviceLabel).toBe('Tipo de Ensaio');
    expect(NICHES.ecommerce.fieldLabels.serviceLabel).toBe('Produto / Linha');
    expect(NICHES.imobiliaria.fieldLabels.serviceLabel).toBe('Tipo de Imóvel');
  });

  it('getNicheConfig falls back safely to concept on missing or invalid key', () => {
    expect(getNicheConfig(null).key).toBe('concept');
    expect(getNicheConfig(undefined).key).toBe('concept');
    expect(getNicheConfig('invalido').key).toBe('concept');
    expect(getNicheConfig('barbeiro').key).toBe('barbeiro');
  });

  it('isValidNiche checks valid niche keys correctly', () => {
    expect(isValidNiche('advogado')).toBe(true);
    expect(isValidNiche('barbeiro')).toBe(true);
    expect(isValidNiche('qualquer_coisa')).toBe(false);
    expect(isValidNiche('')).toBe(false);
  });
});
