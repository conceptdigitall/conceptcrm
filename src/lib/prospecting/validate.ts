type Result =
  | { ok: true; value: { query: string; location: string; maxResults: number } }
  | { ok: false; error: string };

const MAX_QUERY_LEN = 120;
const MAX_LOCATION_LEN = 300;

export function validateSearchInput(body: unknown): Result {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corpo inválido' };
  const b = body as Record<string, unknown>;
  const query = typeof b.query === 'string' ? b.query.trim() : '';
  const location = typeof b.location === 'string' ? b.location.trim() : '';
  if (!query) return { ok: false, error: 'Informe o que buscar' };
  if (!location) return { ok: false, error: 'Informe a cidade' };
  if (query.length > MAX_QUERY_LEN || location.length > MAX_LOCATION_LEN) {
    return { ok: false, error: 'Texto muito longo' };
  }
  if (/[\r\n]/.test(query) || /[\r\n]/.test(location)) {
    return { ok: false, error: 'Use uma linha só' };
  }
  const raw = typeof b.maxResults === 'number' && Number.isFinite(b.maxResults) ? b.maxResults : 50;
  const maxResults = Math.min(200, Math.max(1, Math.round(raw)));
  return { ok: true, value: { query, location, maxResults } };
}
