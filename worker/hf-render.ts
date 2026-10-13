import { readFile as fsReadFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from './exec';

// The pinned local CLI; `npx hyperframes` from a temp dir would fetch the latest from npm.
const HYPERFRAMES_BIN = join(process.cwd(), 'node_modules', '.bin', 'hyperframes');

export interface RenderDeps {
  check(dir: string): Promise<{ ok: boolean; output: string }>;
  render(dir: string, out: string): Promise<void>;
  poster(video: string, out: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
}

export const defaultRenderDeps: RenderDeps = {
  async check(dir) {
    const r = await runCommand(HYPERFRAMES_BIN, ['check'], { cwd: dir, timeoutMs: 5 * 60 * 1000 });
    return { ok: r.code === 0, output: `${r.stdout}\n${r.stderr}` };
  },
  async render(dir, out) {
    const r = await runCommand(HYPERFRAMES_BIN, ['render', '--quality', 'looks', '--output', out], {
      cwd: dir, timeoutMs: 15 * 60 * 1000,
    });
    if (r.code !== 0) throw new Error(`Render falhou: ${r.stderr.slice(-800)}`);
  },
  async poster(video, out) {
    const r = await runCommand('ffmpeg', ['-y', '-ss', '1', '-i', video, '-frames:v', '1', out], {
      timeoutMs: 60 * 1000,
    });
    if (r.code !== 0) throw new Error(`Poster falhou: ${r.stderr.slice(-400)}`);
  },
  readFile: (p) => fsReadFile(p),
};
