import { describe, expect, it } from 'vitest';
import { formatElapsed, getStatusPhrase, STATUS_PHRASES } from './progress';

describe('progress helpers', () => {
  it('formats elapsed time to MM:SS', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(9)).toBe('00:09');
    expect(formatElapsed(60)).toBe('01:00');
    expect(formatElapsed(75)).toBe('01:15');
    expect(formatElapsed(630)).toBe('10:30');
  });

  it('cycles through status phrases based on elapsed seconds', () => {
    expect(STATUS_PHRASES.length).toBeGreaterThan(3);
    const phrase0 = getStatusPhrase(0);
    expect(phrase0).toBe(STATUS_PHRASES[0]);

    // Changes every 4 seconds
    const phrase4 = getStatusPhrase(4);
    expect(phrase4).toBe(STATUS_PHRASES[1]);

    const phrase8 = getStatusPhrase(8);
    expect(phrase8).toBe(STATUS_PHRASES[2]);

    // Wraps around properly
    const wrapIndex = STATUS_PHRASES.length * 4;
    expect(getStatusPhrase(wrapIndex)).toBe(STATUS_PHRASES[0]);
  });
});
