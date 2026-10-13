import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { publishToInstagram, InstagramApiError, MAX_CAPTION_LENGTH } from './instagram';

describe('instagram publisher', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      META_ACCESS_TOKEN: 'mock_token',
      META_IG_USER_ID: 'mock_user_123',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when META_ACCESS_TOKEN or META_IG_USER_ID is missing', async () => {
    delete process.env.META_ACCESS_TOKEN;
    await expect(
      publishToInstagram({ kind: 'feed', mediaType: 'foto', mediaUrls: ['https://ex.com/img.jpg'] }),
    ).rejects.toThrow(InstagramApiError);
  });

  it('throws when caption exceeds maximum length', async () => {
    const longCaption = 'a'.repeat(MAX_CAPTION_LENGTH + 5);
    await expect(
      publishToInstagram({
        kind: 'feed',
        mediaType: 'foto',
        mediaUrls: ['https://ex.com/img.jpg'],
        caption: longCaption,
      }),
    ).rejects.toThrow('Legenda excede o limite');
  });

  it('publishes single photo to feed successfully', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'container_abc' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'media_xyz' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'media_xyz', permalink: 'https://instagram.com/p/test' }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await publishToInstagram({
      kind: 'feed',
      mediaType: 'foto',
      mediaUrls: ['https://conceptdigital.com.br/foto.jpg'],
      caption: 'Post Concept Digital',
    });

    expect(result.mediaId).toBe('media_xyz');
    expect(result.permalink).toBe('https://instagram.com/p/test');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('handles expired token (code 190)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 190, message: 'Invalid OAuth access token' } }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      publishToInstagram({
        kind: 'feed',
        mediaType: 'foto',
        mediaUrls: ['https://conceptdigital.com.br/foto.jpg'],
      }),
    ).rejects.toThrow('Token da Meta expirou');
  });
});
