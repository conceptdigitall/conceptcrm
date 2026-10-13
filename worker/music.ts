// Biblioteca de trilhas de fundo dos vídeos (worker/music/tracks.json).
// O worker escolhe uma faixa pelo tom do vídeo e copia para assets/music.mp3
// no lugar da trilha fixa do scaffold. Sem biblioteca, fica a do scaffold.
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VideoTone } from '@/types';

export interface Track {
  file: string;
  title: string;
  tones: VideoTone[];
  source: string;
  license: string;
}

export const MUSIC_DIR = join(process.cwd(), 'worker', 'music');

export async function loadTracks(dir = MUSIC_DIR): Promise<Track[]> {
  const raw = await readFile(join(dir, 'tracks.json'), 'utf8').catch(() => null);
  if (!raw) return [];
  const list = (JSON.parse(raw) as { tracks?: Track[] }).tracks ?? [];
  const present = await Promise.all(list.map((t) => access(join(dir, t.file)).then(() => true, () => false)));
  return list.filter((_, i) => present[i]);
}

// Mesmo vídeo, mesma faixa (repetir o job não troca a música); vídeos
// diferentes giram entre as faixas do tom.
export function pickTrack(tracks: Track[], tone: VideoTone, seed: string): Track | null {
  const byTone = tracks.filter((t) => t.tones.includes(tone));
  const pool = byTone.length > 0 ? byTone : tracks;
  if (pool.length === 0) return null;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}
