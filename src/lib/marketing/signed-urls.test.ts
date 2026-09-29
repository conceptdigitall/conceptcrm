import { describe, expect, it } from 'vitest';
import { pathsToSign } from './signed-urls';

const now = 1_000_000_000;
const rows = [
  { video_path: 'a.mp4', poster_path: 'a.jpg' },
  { video_path: null, poster_path: null },
  { video_path: 'b.mp4', poster_path: 'b.jpg' },
];

describe('pathsToSign', () => {
  it('signs every path the first time', () => {
    expect(pathsToSign(rows, new Map(), now)).toEqual(['a.mp4', 'a.jpg', 'b.mp4', 'b.jpg']);
  });
  it('keeps fresh URLs so playing videos are not reloaded on each poll', () => {
    const cache = new Map([
      ['a.mp4', { url: 'u1', signedAt: now - 60_000 }],
      ['a.jpg', { url: 'u2', signedAt: now - 60_000 }],
    ]);
    expect(pathsToSign(rows, cache, now)).toEqual(['b.mp4', 'b.jpg']);
  });
  it('re-signs URLs older than 50 minutes (they expire at 60)', () => {
    const cache = new Map([['a.mp4', { url: 'u1', signedAt: now - 51 * 60_000 }]]);
    expect(pathsToSign([{ video_path: 'a.mp4', poster_path: null }], cache, now)).toEqual(['a.mp4']);
  });
});
