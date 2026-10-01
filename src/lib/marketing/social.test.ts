import { describe, expect, it } from 'vitest';
import { generateSocialCaption, getSocialShareLinks } from './social';

describe('social publication helpers', () => {
  it('generates caption from prompt with tone and hashtags', () => {
    const res = generateSocialCaption({
      prompt: 'Promoção imperdível de corte e barba por R$ 50 nesta sexta!',
      tone: 'polished',
    });

    expect(res.caption).toContain('Promoção imperdível de corte e barba');
    expect(res.caption).toContain('#');
    expect(res.hashtags.length).toBeGreaterThan(2);
  });

  it('generates fallback caption when video has only photos (no prompt)', () => {
    const res = generateSocialCaption({
      prompt: '',
      tone: 'default',
    });

    expect(res.caption).toBeTruthy();
    expect(res.caption).toContain('WhatsApp');
    expect(res.hashtags).toContain('#novidades');
  });

  it('returns valid URLs for social media platforms', () => {
    const links = getSocialShareLinks('Legenda teste');

    expect(links.metaBusiness).toContain('https://business.facebook.com');
    expect(links.tiktok).toContain('https://www.tiktok.com');
    expect(links.linkedin).toContain('https://www.linkedin.com');
    expect(links.whatsapp).toContain('https://api.whatsapp.com');
    expect(links.whatsapp).toContain('text=Legenda');
  });
});
