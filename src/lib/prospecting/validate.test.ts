import { describe, expect, it } from 'vitest';
import { validateSearchInput } from './validate';

describe('validateSearchInput', () => {
  it('accepts a valid search and trims', () => {
    expect(validateSearchInput({ query: ' barbearia ', location: ' Santos, SP ', maxResults: 30 }))
      .toEqual({ ok: true, value: { query: 'barbearia', location: 'Santos, SP', maxResults: 30 } });
  });
  it('defaults maxResults to 50', () => {
    const r = validateSearchInput({ query: 'imobiliária', location: 'Santos' });
    expect(r.ok && r.value.maxResults).toBe(50);
  });
  it('clamps maxResults into 1..200', () => {
    const hi = validateSearchInput({ query: 'a', location: 'b', maxResults: 999 });
    const lo = validateSearchInput({ query: 'a', location: 'b', maxResults: 0 });
    expect(hi.ok && hi.value.maxResults).toBe(200);
    expect(lo.ok && lo.value.maxResults).toBe(1);
  });
  it('rejects missing fields, long text and newlines', () => {
    expect(validateSearchInput(null).ok).toBe(false);
    expect(validateSearchInput({ query: '', location: 'Santos' }).ok).toBe(false);
    expect(validateSearchInput({ query: 'a', location: '' }).ok).toBe(false);
    expect(validateSearchInput({ query: 'x'.repeat(121), location: 'Santos' }).ok).toBe(false);
    // One query per line in the scraper input file — a newline would inject a second search.
    expect(validateSearchInput({ query: 'a\nb', location: 'Santos' }).ok).toBe(false);
  });
});
