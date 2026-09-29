export interface SignedEntry {
  url: string;
  signedAt: number;
}

// Signed URLs live 60 min; re-sign a little before that.
const MAX_AGE_MS = 50 * 60 * 1000;

export function pathsToSign(
  rows: { video_path: string | null; poster_path: string | null }[],
  cache: Map<string, SignedEntry>,
  now: number,
): string[] {
  const out: string[] = [];
  for (const row of rows) {
    for (const path of [row.video_path, row.poster_path]) {
      if (!path) continue;
      const hit = cache.get(path);
      if (!hit || now - hit.signedAt > MAX_AGE_MS) out.push(path);
    }
  }
  return out;
}
