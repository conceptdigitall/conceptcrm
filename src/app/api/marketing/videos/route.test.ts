import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), insert: vi.fn(), count: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

const supabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        gte: async () => ({ count: mocks.count(), error: null }),
      }),
    }),
    insert: (row: unknown) => {
      mocks.insert(row);
      return {
        select: () => {
          const rows = Array.isArray(row) ? row : [row];
          return Object.assign(
            Promise.resolve({ data: rows.map((r, i) => ({ id: `v-${i + 1}`, ...(r as object) })), error: null }),
            { single: async () => ({ data: { id: 'v-1', ...(row as object) }, error: null }) },
          );
        },
      };
    },
  }),
};

const req = (body: unknown) =>
  new Request('http://localhost/api/marketing/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.count.mockReturnValue(0);
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'user-1', supabase });
});

describe('POST /api/marketing/videos', () => {
  it('inserts a pending video job', async () => {
    const res = await POST(req({ prompt: 'Promo', imagePaths: ['account-acc-1/uploads/1-a.jpg'], tone: 'polished' }));
    expect(res.status).toBe(201);
    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(mocks.insert).toHaveBeenCalledWith({
      account_id: 'acc-1', created_by: 'user-1', prompt: 'Promo',
      image_paths: ['account-acc-1/uploads/1-a.jpg'], format: 'vertical', tone: 'polished', status: 'pending',
      kind: 'reels',
    });
  });

  it('400s on invalid input', async () => {
    expect((await POST(req({ prompt: '' }))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('429s when daily limit is reached', async () => {
    mocks.count.mockReturnValue(10);
    const res = await POST(req({ prompt: 'Promo', imagePaths: ['account-acc-1/uploads/1-a.jpg'] }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain('Limite diário');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('legado horizontal grava kind resumo', async () => {
    await POST(req({ prompt: 'Promo', imagePaths: [], format: 'landscape' }));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ format: 'landscape', kind: 'resumo' }));
  });

  describe('por botão do pacote', () => {
    const photos = [1, 2, 3, 4].map((n) => `account-acc-1/uploads/${n}-a.jpg`);
    const button = { buttonId: 'compilado', fields: { name: 'Degradê', benefit: 'Na régua' }, imagePaths: photos, formats: ['vertical'] };

    it('enfileira uma linha por formato quando o nicho está ligado', async () => {
      vi.stubEnv('NEXT_PUBLIC_MARKETING_NICHE', 'barbearia');
      const res = await POST(req({ ...button, formats: ['vertical', 'square'] }));
      expect(res.status).toBe(201);
      const rows = mocks.insert.mock.calls[0][0] as Record<string, unknown>[];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ kind: 'reels', niche: 'barbearia', template_id: 'compilado' });
      expect((await res.json()).videos).toHaveLength(2);
      vi.unstubAllEnvs();
    });

    it('400 quando nenhum nicho está ligado neste deploy', async () => {
      vi.stubEnv('NEXT_PUBLIC_MARKETING_NICHE', '');
      expect((await POST(req(button))).status).toBe(400);
      expect(mocks.insert).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('400 para botão de outro nicho enviado direto à API', async () => {
      vi.stubEnv('NEXT_PUBLIC_MARKETING_NICHE', 'barbearia');
      expect((await POST(req({ ...button, buttonId: 'tour-do-imovel' }))).status).toBe(400);
      expect(mocks.insert).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
  });
});
