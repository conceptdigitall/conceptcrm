import { describe, expect, it } from 'vitest';
import { HAIKU_MODEL, directorModel, serverFallback, visionModel } from './video-models';

describe('directorModel', () => {
  it('usa o VIDEO_MODEL quando é um modelo Claude', () => {
    expect(directorModel({ VIDEO_MODEL: 'claude-opus-5-5' })).toBe('claude-opus-5-5');
  });

  it('cai no Haiku quando o VIDEO_MODEL é Gemini (motor do modo livre)', () => {
    expect(directorModel({ VIDEO_MODEL: 'gemini-3.8-flash' })).toBe(HAIKU_MODEL);
  });

  it('cai no Haiku sem VIDEO_MODEL', () => {
    expect(directorModel({})).toBe(HAIKU_MODEL);
  });
});

describe('visionModel', () => {
  it('fica no Haiku mesmo com o diretor em Opus', () => {
    expect(visionModel({ VIDEO_MODEL: 'claude-opus-5-5' })).toBe(HAIKU_MODEL);
  });

  it('aceita VIDEO_VISION_MODEL quando definido', () => {
    expect(visionModel({ VIDEO_VISION_MODEL: 'claude-sonnet-5-5' })).toBe('claude-sonnet-5-5');
  });

  it('ignora VIDEO_VISION_MODEL que não é Claude', () => {
    expect(visionModel({ VIDEO_VISION_MODEL: 'gemini-3.8-flash' })).toBe(HAIKU_MODEL);
  });
});

describe('serverFallback', () => {
  it('liga o fallback de recusa no Opus 5.5', () => {
    expect(serverFallback('claude-opus-5-5')).toEqual({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  });

  it('não manda nada no Haiku 4.5', () => {
    expect(serverFallback(HAIKU_MODEL)).toEqual({});
  });
});
