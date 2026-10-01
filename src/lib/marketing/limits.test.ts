import { describe, expect, it } from 'vitest';
import {
  DAILY_VIDEO_LIMIT,
  getRemainingDailyVideos,
  getStartOfTodayIso,
  isDailyLimitReached,
} from './limits';

describe('daily limits helpers', () => {
  it('default limit is 10', () => {
    expect(DAILY_VIDEO_LIMIT).toBe(10);
  });

  it('checks if limit is reached', () => {
    expect(isDailyLimitReached(0)).toBe(false);
    expect(isDailyLimitReached(9)).toBe(false);
    expect(isDailyLimitReached(10)).toBe(true);
    expect(isDailyLimitReached(15)).toBe(true);
  });

  it('computes remaining daily videos', () => {
    expect(getRemainingDailyVideos(0)).toBe(10);
    expect(getRemainingDailyVideos(4)).toBe(6);
    expect(getRemainingDailyVideos(10)).toBe(0);
    expect(getRemainingDailyVideos(12)).toBe(0);
  });

  it('generates ISO timestamp for start of day', () => {
    const iso = getStartOfTodayIso();
    const date = new Date(iso);
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
    expect(date.getUTCSeconds()).toBe(0);
  });
});
