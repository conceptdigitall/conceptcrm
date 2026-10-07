import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planTimeline, renderComposition } from '../render';
import { barbeariaPack } from './pack';

// Cada task de template acrescenta o seu id aqui.
const IMPLEMENTED = ['compilado', 'antes-depois', 'oferta'];

const FORMATS = [
  { name: '9:16', width: 1080, height: 1920 },
  { name: '1:1', width: 1080, height: 1080 },
];

function load(id: string): string {
  return readFileSync(join(__dirname, 'templates', id, 'composition.html'), 'utf8');
}

describe.each(IMPLEMENTED)('template %s', (id) => {
  const spec = barbeariaPack.templates.find((t) => t.id === id)!;
  const html = load(id);

  it('repete as fotos com {{#photos}} e usa toda chave de texto obrigatória', () => {
    expect(html).toContain('{{#photos}}');
    expect(html).toContain('{{/photos}}');
    for (const [key, rule] of Object.entries(spec.texts)) {
      if (rule.required) expect(html, `texto ${key}`).toContain(`{{text.${key}}}`);
    }
  });

  it('só usa chaves de texto declaradas no template.json', () => {
    const used = [...html.matchAll(/\{\{text\.(\w+)\}\}/g)].map((m) => m[1]);
    for (const key of used) expect(Object.keys(spec.texts), `chave ${key}`).toContain(key);
  });

  it('é determinístico e sem recursos externos além do GSAP', () => {
    expect(html).not.toMatch(/Date\.now|performance\.now|Math\.random|repeat:\s*-1|<br/);
    expect(html).not.toMatch(/<link|@import|url\(\s*['"]?https?:/);
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of scripts) expect(src).toBe('https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js');
    expect(html).toContain('window.__timelines["main"]');
  });

  describe.each(FORMATS)('em $name', ({ width, height }) => {
    for (const count of [spec.photos.min, spec.photos.max]) {
      it(`renderiza com ${count} fotos sem placeholder sobrando`, () => {
        const texts = Object.fromEntries(Object.keys(spec.texts).map((k) => [k, `Texto ${k}`]));
        const photos = Array.from({ length: count }, (_, i) => `assets/img-${i + 1}.jpg`);
        const out = renderComposition(html, { width, height, texts, photos, timeline: planTimeline(count) });
        expect(out).not.toContain('{{');
        expect(out).toContain(`data-width="${width}"`);
        expect(out).toContain(`data-height="${height}"`);
        expect(out.match(/assets\/img-\d+\.jpg/g)?.length).toBeGreaterThanOrEqual(count);
      });
    }
  });
});
