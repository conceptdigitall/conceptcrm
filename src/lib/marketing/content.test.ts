import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, activeHashtags, buildCaption, buildCaptionOptions, captionSystemPrompt, nextVersionNumber,
  parseCaptionOptions, projectVideoPrompt, variationPrompt,
} from './content';

describe('marketing content helpers', () => {
  it('limits active hashtags to 8 and skips disabled ones', () => {
    const groups = [{ group: 'a', tags: Array.from({ length: 12 }, (_, i) => ({ t: `#t${i}`, on: i !== 0 })) }];
    const tags = activeHashtags(groups);
    expect(tags).toHaveLength(8);
    expect(tags).not.toContain('#t0');
  });

  it('builds caption with cta and hashtags; short size keeps first sentence', () => {
    const full = buildCaption(DEFAULT_SETTINGS, 'Primeira frase. Segunda frase.', 'media');
    expect(full).toContain('Primeira frase. Segunda frase.');
    expect(full).toContain(DEFAULT_SETTINGS.cta);
    expect(full).toContain('#conceptdigital');
    const short = buildCaption(DEFAULT_SETTINGS, 'Primeira frase. Segunda frase.', 'curta');
    expect(short).not.toContain('Segunda frase.');
  });

  it('variation prompt lists what changes', () => {
    const p = variationPrompt('Base', ['Texto na tela'], 'Troca o título');
    expect(p).toContain('mude somente: Texto na tela');
    expect(p.startsWith('Base')).toBe(true);
  });

  it('project prompt includes name, url and duration', () => {
    const p = projectVideoPrompt({ name: 'Barbearia', url: 'https://x.com' }, 'mockup', 15);
    expect(p).toContain('Barbearia');
    expect(p).toContain('https://x.com');
    expect(p).toContain('15 segundos');
  });

  it('next version is max + 1', () => {
    expect(nextVersionNumber([{ version: 1 }, { version: 3 }])).toBe(4);
    expect(nextVersionNumber([])).toBe(1);
  });
});

describe('legendas do modal de criar post', () => {
  const s = { ...DEFAULT_SETTINGS, account_id: 'a' };

  it('buildCaptionOptions devolve 3 legendas distintas, a primeira no estilo salvo', () => {
    const opts = buildCaptionOptions({ ...s, caption_style: 'provocativo' }, 'Responder rápido vende mais.');
    expect(opts).toHaveLength(3);
    expect(new Set(opts).size).toBe(3);
    expect(opts[0]).toContain('Quantas vezes você ignorou isto?');
  });

  it('parseCaptionOptions separa por --- e descarta pedaços curtos', () => {
    const raw = 'Legenda um com texto suficiente aqui.\n---\nLegenda dois com texto suficiente aqui.\n---\nok\n---\nLegenda três com texto suficiente aqui.\n---\nLegenda quatro com texto suficiente.';
    expect(parseCaptionOptions(raw)).toEqual([
      'Legenda um com texto suficiente aqui.',
      'Legenda dois com texto suficiente aqui.',
      'Legenda três com texto suficiente aqui.',
    ]);
  });

  it('captionSystemPrompt inclui CTA, proibições e hashtags ativas', () => {
    const p = captionSystemPrompt(s);
    expect(p).toContain(s.cta);
    expect(p).toContain(s.never_use);
    expect(p).toContain('#conceptdigital');
  });
});
