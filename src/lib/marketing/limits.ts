export const DAILY_VIDEO_LIMIT = 10;

export function isDailyLimitReached(countToday: number, limit: number = DAILY_VIDEO_LIMIT): boolean {
  return countToday >= limit;
}

export function getRemainingDailyVideos(countToday: number, limit: number = DAILY_VIDEO_LIMIT): number {
  return Math.max(0, limit - countToday);
}

export function getStartOfTodayIso(): string {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  return startOfDay.toISOString();
}
