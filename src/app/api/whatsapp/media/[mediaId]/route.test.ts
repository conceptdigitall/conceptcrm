import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { account_id: 'acc-123' },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: { access_token: 'enc-token' },
            error: null,
          }),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: vi.fn(() => 'decrypted-token'),
}));

vi.mock('@/lib/whatsapp/meta-api', () => ({
  getMediaUrl: vi.fn().mockResolvedValue({ url: 'https://meta.com/media/123', mimeType: 'image/jpeg' }),
  downloadMedia: vi.fn().mockResolvedValue({
    buffer: Buffer.from('fake-image-bytes'),
    contentType: 'image/jpeg',
  }),
}));

describe('GET /api/whatsapp/media/[mediaId]', () => {
  it('returns response with private no-cache Cache-Control header', async () => {
    const req = new Request('http://localhost:3000/api/whatsapp/media/123');
    const res = await GET(req, { params: Promise.resolve({ mediaId: '123' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache, no-store, must-revalidate');
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });
});
