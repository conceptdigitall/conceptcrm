import type { JobStatus } from '@/types';

export function hasStalePending(
  rows: { status: JobStatus; created_at: string }[],
  now: number,
  thresholdMs = 10 * 60 * 1000,
): boolean {
  return rows.some((r) => r.status === 'pending' && now - Date.parse(r.created_at) > thresholdMs);
}
