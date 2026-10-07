// Render real dos templates de pacote: Chrome do HyperFrames + ffmpeg, com rede
// (GSAP por CDN e fontes). Fora do `npm test` normal; rode no Mac do worker:
//   HF_E2E=1 npx vitest run worker/video-template.e2e.test.ts
// As capas ficam em <tmp>/hf-e2e/ para aprovação visual.
import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { barbeariaPack } from '@/lib/marketing/packs/barbearia/pack';
import { planTimeline, renderComposition } from '@/lib/marketing/packs/render';
import { FORMAT_SIZE } from '@/lib/marketing/prompt';
import { defaultRenderDeps } from './hf-render';

const run = promisify(execFile);
const OUT = join(tmpdir(), 'hf-e2e');
const SAMPLE_TEXTS: Record<string, string> = {
  titulo: 'Os cortes da semana', subtitulo: 'Degradê, barba e navalha', cta: 'Agende pelo WhatsApp',
  item: 'Corte + Barba', price: 'R$ 59,90', deadline: 'Só nesta quinta e sexta',
};
const FORMATS = ['vertical', 'square'] as const;

async function samplePhoto(n: number): Promise<Buffer> {
  const hue = (n * 47) % 360;
  const svg = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="hsl(${hue},45%,35%)"/>
    <text x="540" y="700" font-size="160" fill="white" text-anchor="middle" font-family="Arial">Foto ${n}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

async function probe(file: string) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
  ]);
  const j = JSON.parse(stdout) as { streams: { width: number; height: number }[]; format: { duration: string } };
  return { width: j.streams[0].width, height: j.streams[0].height, duration: Number(j.format.duration) };
}

describe.skipIf(!process.env.HF_E2E)('render real dos templates da Barbearia', () => {
  for (const spec of barbeariaPack.templates) {
    for (const format of FORMATS) {
      it(`${spec.id} em ${format}`, { timeout: 15 * 60 * 1000 }, async () => {
        const dir = join(OUT, `${spec.id}-${format}`);
        await mkdir(join(dir, 'assets'), { recursive: true });
        await cp(join(process.cwd(), 'worker', 'video-scaffold'), dir, { recursive: true });

        const count = Math.min(spec.photos.max, Math.max(spec.photos.min, 4));
        const photos: string[] = [];
        for (let i = 1; i <= count; i++) {
          const rel = `assets/img-${i}.jpg`;
          await writeFile(join(dir, rel), await samplePhoto(i));
          photos.push(rel);
        }
        const texts = Object.fromEntries(Object.keys(spec.texts).map((k) => [k, SAMPLE_TEXTS[k] ?? '']));
        const html = await readFile(
          join(process.cwd(), 'src/lib/marketing/packs/barbearia/templates', spec.id, 'composition.html'), 'utf8',
        );
        const size = FORMAT_SIZE[format];
        await writeFile(join(dir, 'index.html'), renderComposition(html, { ...size, texts, photos, timeline: planTimeline(count) }));

        let check = await defaultRenderDeps.check(dir);
        if (!check.ok) check = await defaultRenderDeps.check(dir); // rede pode falhar uma vez
        expect(check.ok, check.output.slice(-800)).toBe(true);

        const mp4 = join(dir, 'out.mp4');
        const jpg = join(OUT, `${spec.id}-${format}.jpg`);
        await defaultRenderDeps.render(dir, mp4);
        await defaultRenderDeps.poster(mp4, jpg);

        expect((await stat(mp4)).size).toBeGreaterThan(0);
        expect((await stat(jpg)).size).toBeGreaterThan(0);
        const meta = await probe(mp4);
        expect({ width: meta.width, height: meta.height }).toEqual(size);
        expect(meta.duration).toBeGreaterThanOrEqual(15);
        expect(meta.duration).toBeLessThanOrEqual(25);
      });
    }
  }
});
