import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTracks, pickTrack, type Track } from './music';

const t = (file: string, tones: Track['tones']): Track => ({ file, title: file, tones, source: 's', license: 'l' });

describe('pickTrack', () => {
  it('prefere faixa do tom e é estável por vídeo', () => {
    const tracks = [t('a.mp3', ['default']), t('b.mp3', ['cinematic']), t('c.mp3', ['cinematic'])];
    const first = pickTrack(tracks, 'cinematic', 'video-1');
    expect(['b.mp3', 'c.mp3']).toContain(first?.file);
    expect(pickTrack(tracks, 'cinematic', 'video-1')).toBe(first);
  });
  it('cai para qualquer faixa sem o tom, e null sem biblioteca', () => {
    expect(pickTrack([t('a.mp3', ['default'])], 'polished', 'x')?.file).toBe('a.mp3');
    expect(pickTrack([], 'default', 'x')).toBeNull();
  });
});

describe('loadTracks', () => {
  it('ignora faixa listada sem arquivo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'music-'));
    await writeFile(join(dir, 'a.mp3'), 'x');
    await writeFile(join(dir, 'tracks.json'), JSON.stringify({ tracks: [t('a.mp3', ['default']), t('falta.mp3', ['default'])] }));
    expect((await loadTracks(dir)).map((x) => x.file)).toEqual(['a.mp3']);
  });
  it('sem tracks.json devolve vazio', async () => {
    expect(await loadTracks(await mkdtemp(join(tmpdir(), 'music-')))).toEqual([]);
  });
});
