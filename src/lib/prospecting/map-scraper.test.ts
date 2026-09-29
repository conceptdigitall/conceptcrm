import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapPlaceToLead, parseScraperOutput } from './map-scraper';

const fixture = readFileSync(join(__dirname, '__fixtures__/scraper-sample.json'), 'utf8');
const ctx = { accountId: 'acc-1', searchId: 'search-1' };

describe('parseScraperOutput', () => {
  it('parses a JSON array', () => {
    expect(parseScraperOutput(fixture)).toHaveLength(5);
  });
  it('parses NDJSON and skips blank or broken lines', () => {
    const nd = '{"title":"A"}\n\n{"title":"B"}\nnot json\n';
    expect(parseScraperOutput(nd).map((p) => p.title)).toEqual(['A', 'B']);
  });
  it('returns [] for empty output', () => {
    expect(parseScraperOutput('')).toEqual([]);
  });
});

describe('mapPlaceToLead', () => {
  it('maps fields, normalizes phone and scores', () => {
    const lead = mapPlaceToLead(
      {
        title: 'Barbearia Teste',
        category: 'Barbearia',
        address: 'Rua X, 10 - Santos',
        phone: '(13) 99123-4567',
        web_site: '',
        review_rating: 4.1,
        review_count: 8,
        place_id: 'ChIJ123',
        link: 'https://maps.google.com/?cid=1',
        emails: ['dono@barbearia.com.br'],
      },
      ctx,
    );
    expect(lead).toMatchObject({
      account_id: 'acc-1',
      search_id: 'search-1',
      place_id: 'ChIJ123',
      name: 'Barbearia Teste',
      phone: '5513991234567',
      is_mobile: true,
      website: null,
      email: 'dono@barbearia.com.br',
      rating: 4.1,
      review_count: 8,
      maps_url: 'https://maps.google.com/?cid=1',
      score: 100,
    });
  });
  it('reads the site from the real scraper key web_site', () => {
    const [noSite, withSite] = parseScraperOutput(fixture).map((p) => mapPlaceToLead(p, ctx));
    expect(noSite.website).toBeNull();
    expect(withSite.website).toBe('https://exemplo2.com.br');
    expect(withSite.score_reasons).not.toContain('Sem site');
  });
  it('drops non-http site and maps links', () => {
    const lead = mapPlaceToLead({ title: 'X', web_site: 'javascript:alert(1)', link: 'data:text/html,x' }, ctx);
    expect(lead.website).toBeNull();
    expect(lead.maps_url).toBeNull();
  });
  it('maps every fixture entry without throwing', () => {
    for (const p of parseScraperOutput(fixture)) {
      expect(mapPlaceToLead(p, ctx).name.length).toBeGreaterThan(0);
    }
  });
  it('falls back to "Sem nome" and nulls for a sparse place', () => {
    const lead = mapPlaceToLead({}, ctx);
    expect(lead.name).toBe('Sem nome');
    expect(lead.phone).toBeNull();
    expect(lead.place_id).toBeNull();
  });
});
