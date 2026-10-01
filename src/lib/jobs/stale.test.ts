import { describe, expect, it } from 'vitest';
import { hasStalePending } from './stale';

const now = Date.parse('2026-09-29T12:00:00Z');

describe('hasStalePending', () => {
  it('is true when a pending job is older than 10 minutes', () => {
    expect(hasStalePending([{ status: 'pending', created_at: '2026-09-29T11:49:00Z' }], now)).toBe(true);
  });
  it('ignores recent pending and non-pending jobs', () => {
    expect(hasStalePending([
      { status: 'pending', created_at: '2026-09-29T11:55:00Z' },
      { status: 'failed', created_at: '2026-09-29T10:00:00Z' },
    ], now)).toBe(false);
  });
});
