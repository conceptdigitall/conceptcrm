import { describe, expect, it } from 'vitest';
import { planTimeline, renderComposition, type RenderData } from './render';

const base = (over: Partial<RenderData> = {}): RenderData => ({
  width: 1080,
  height: 1920,
  texts: { titulo: 'Os cortes da semana' },
  photos: ['assets/img-1.jpg', 'assets/img-2.jpg', 'assets/img-3.jpg', 'assets/img-4.jpg'],
  timeline: planTimeline(4),
  ...over,
});

describe('planTimeline', () => {
  it('mantém a duração total entre 15 e 25 s para 1 a 10 fotos', () => {
    for (let n = 1; n <= 10; n++) {
      const { totalSec } = planTimeline(n);
      expect(totalSec, `${n} fotos`).toBeGreaterThanOrEqual(15);
      expect(totalSec, `${n} fotos`).toBeLessThanOrEqual(25);
    }
  });
  it('nunca deixa uma foto menos de 1.2 s na tela', () => {
    expect(planTimeline(10).perPhotoSec).toBeGreaterThanOrEqual(1.2);
  });
  it('usa gancho de 2 s e fecho de 3 s', () => {
    const t = planTimeline(4);
    expect(t.introSec).toBe(2);
    expect(t.outroSec).toBe(3);
    expect(t.totalSec).toBeCloseTo(t.introSec + 4 * t.perPhotoSec + t.outroSec, 5);
  });
  it('é determinística', () => {
    expect(planTimeline(7)).toEqual(planTimeline(7));
  });
});

describe('renderComposition', () => {
  it('é determinística: mesma entrada, mesma saída', () => {
    const html = '<h1>{{text.titulo}}</h1>{{#photos}}<img src="{{src}}">{{/photos}}';
    expect(renderComposition(html, base())).toBe(renderComposition(html, base()));
  });
  it('escapa HTML nos textos do dono', () => {
    const out = renderComposition('<h1>{{text.titulo}}</h1>', base({
      texts: { titulo: '<script>alert(1)</script> & "x" \'y\'' },
    }));
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot; &#39;y&#39;');
  });
  it('preserva acentos e emoji', () => {
    const out = renderComposition('<h1>{{text.titulo}}</h1>', base({ texts: { titulo: 'Corte na régua ✂️🔥' } }));
    expect(out).toContain('Corte na régua ✂️🔥');
  });
  it('repete o bloco por foto com i, start, dur e src', () => {
    const data = base();
    const { introSec, perPhotoSec } = data.timeline;
    const out = renderComposition(
      '{{#photos}}<s i="{{i}}" start="{{start}}" dur="{{dur}}" src="{{src}}"></s>{{/photos}}', data,
    );
    expect(out.match(/<s /g)).toHaveLength(4);
    expect(out).toContain(`i="1" start="${introSec}"`);
    expect(out).toContain(`i="2" start="${+(introSec + perPhotoSec).toFixed(3)}"`);
    expect(out).toContain('src="assets/img-4.jpg"');
  });
  it('substitui largura, altura e tempos globais', () => {
    const data = base({ width: 1080, height: 1080 });
    const out = renderComposition('{{width}}x{{height}} {{introSec}} {{outroSec}} {{totalSec}}', data);
    expect(out).toBe(`1080x1080 2 3 ${+data.timeline.totalSec.toFixed(3)}`);
  });
  it('expõe outroStart (início do fecho) = totalSec - outroSec', () => {
    const data = base();
    const out = renderComposition('{{outroStart}}', data);
    expect(out).toBe(String(+(data.timeline.totalSec - data.timeline.outroSec).toFixed(3)));
  });
  it('lança erro para placeholder desconhecido', () => {
    expect(() => renderComposition('{{nada}}', base())).toThrow(/nada/);
  });
  it('lança erro para texto que o template pede e os dados não trazem', () => {
    expect(() => renderComposition('{{text.cta}}', base())).toThrow(/text\.cta/);
  });
  it('lança erro quando i/start/dur/src aparecem fora do bloco de fotos', () => {
    expect(() => renderComposition('{{src}}', base())).toThrow(/src/);
  });
  it('aceita campo opcional vazio', () => {
    expect(renderComposition('[{{text.cta}}]', base({ texts: { titulo: 'a', cta: '' } }))).toBe('[]');
  });
});
