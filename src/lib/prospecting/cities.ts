export interface CityGeo {
  name: string;
  coords: [number, number]; // [lat, lng]
}

export const KNOWN_CITIES: Record<string, [number, number]> = {
  'Santos, SP': [-23.9608, -46.3336],
  'São Vicente, SP': [-23.9631, -46.3919],
  'Guarujá, SP': [-23.9933, -46.2564],
  'Praia Grande, SP': [-24.0058, -46.4028],
  'Cubatão, SP': [-23.8950, -46.4253],
  'Bertioga, SP': [-23.8544, -46.1392],
  'Mongaguá, SP': [-24.0931, -46.6208],
  'Itanhaém, SP': [-24.1831, -46.7889],
  'Peruíbe, SP': [-24.3200, -46.9997],
  'São Paulo, SP': [-23.5505, -46.6333],
  'São Bernardo do Campo, SP': [-23.6939, -46.5650],
  'Santo André, SP': [-23.6639, -46.5383],
  'Campinas, SP': [-22.9056, -47.0608],
  'Sorocaba, SP': [-23.5015, -47.4526],
  'Ribeirão Preto, SP': [-21.1704, -47.8103],
  'Rio de Janeiro, RJ': [-22.9068, -43.1729],
  'Curitiba, PR': [-25.4284, -49.2733],
  'Belo Horizonte, MG': [-19.9167, -43.9345],
};

export const DEFAULT_CITIES = [
  'Santos, SP',
  'São Vicente, SP',
  'Guarujá, SP',
  'Praia Grande, SP',
  'Cubatão, SP',
  'Bertioga, SP',
  'Mongaguá, SP',
  'Itanhaém, SP',
  'Peruíbe, SP',
  'São Paulo, SP',
];

export const BAIXADA_SANTISTA_CITIES = [
  'Santos, SP',
  'São Vicente, SP',
  'Praia Grande, SP',
  'Guarujá, SP',
  'Cubatão, SP',
];

/** Coordenadas conhecidas da cidade, ou null quando ela não está na lista. */
export function findCityCoordinates(cityName: string): [number, number] | null {
  const trimmed = cityName.trim();
  if (KNOWN_CITIES[trimmed]) return KNOWN_CITIES[trimmed];

  const lower = trimmed.toLowerCase();
  for (const [key, coords] of Object.entries(KNOWN_CITIES)) {
    if (key.toLowerCase() === lower || key.toLowerCase().startsWith(lower)) {
      return coords;
    }
  }
  return null;
}

export function getCityCoordinates(cityName: string): [number, number] {
  // Fallback para Santos (região base do Concept CRM)
  return findCityCoordinates(cityName) ?? [-23.9608, -46.3336];
}

export function calculateCenterCoordinates(cities: string[]): [number, number] {
  if (cities.length === 0) return [-23.9608, -46.3336];

  let sumLat = 0;
  let sumLng = 0;

  for (const c of cities) {
    const [lat, lng] = getCityCoordinates(c);
    sumLat += lat;
    sumLng += lng;
  }

  return [sumLat / cities.length, sumLng / cities.length];
}
