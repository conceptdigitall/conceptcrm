import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, activeHashtags, buildCaption, nextVersionNumber, projectVideoPrompt, variationPrompt,
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
