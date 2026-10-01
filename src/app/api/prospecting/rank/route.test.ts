import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  leads: [
    {
      id: 'lead-1',
      account_id: 'acc-1',
      name: 'Clínica Odonto Viva',
      category: 'Dentista',
      rating: 4.6,
      review_count: 90,
      phone: '13999991111',
      is_mobile: true,
      website: null,
      address: 'Santos, SP',
      score: 75,
      score_reasons: ['Avaliações altas'],
      status: 'novo',
    },
    {
      id: 'lead-2',
      account_id: 'acc-1',
      name: 'Pizzaria Noturna',
      category: 'Restaurante',
      rating: 3.8,
      review_count: 50,
      phone: null,
      is_mobile: false,
      website: 'https://pizzaria.com',
      address: 'Santos, SP',
      score: 30,
      score_reasons: ['Sem telefone'],
      status: 'novo',
    },
  ],
  columnValues: [],
  layaBatch: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

vi.mock('@/../worker/laya-client', () => ({
  layaBatch: mocks.layaBatch,
}));

import { POST } from './route';

function ctx(accountId = 'acc-1') {
  return {
    accountId,
    userId: 'user-1',
    supabase: {
      from: (table: string) => {
        if (table === 'leads') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: mocks.leads, error: null }),
                }),
                in: async () => ({ data: mocks.leads, error: null }),
              }),
            }),
          };
        }
        if (table === 'lead_column_values') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: mocks.columnValues, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };
}

const req = (body: unknown) =>
  new Request('http://localhost/api/prospecting/rank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue(ctx());
  mocks.columnValues = [];
  delete process.env.LAYA_URL;
});

describe('POST /api/prospecting/rank', () => {
  it('rejeita requisições sem query com 400', async () => {
    const res = await POST(req({ query: '' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Informe a busca');
  });

  it('rejeita conta externa com 403', async () => {
    mocks.requireRole.mockResolvedValue(ctx('outsider-acc'));
    const res = await POST(req({ query: 'clínicas com alta demanda' }));
    expect(res.status).toBe(403);
  });

  it('ordena os leads do maior para o menor potencial usando fallback determinístico', async () => {
    const res = await POST(req({ query: 'leads mais qualificados para recepcionista de ia' }));
    expect(res.status).toBe(200);

    const json = (await res.json()) as { results: { leadId: string; probability: number }[] };
    expect(json.results.length).toBe(2);
    // lead-1 tem celular e 90 avaliações, lead-2 não tem telefone
    expect(json.results[0].leadId).toBe('lead-1');
    expect(json.results[0].probability).toBeGreaterThan(json.results[1].probability);
  });

  it('integra scores do Laya quando LAYA_URL está definida', async () => {
    process.env.LAYA_URL = 'http://127.0.0.1:8765';
    mocks.layaBatch.mockResolvedValue([
      { score: 1.8, answer_confidence: 0.9 }, // lead-1 (alto)
      { score: 0.4, answer_confidence: 0.5 }, // lead-2 (baixo)
    ]);

    const res = await POST(req({ query: 'recepcionista de ia' }));
    expect(res.status).toBe(200);

    const json = (await res.json()) as { results: { leadId: string; probability: number; reasons: string[] }[] };
    expect(mocks.layaBatch).toHaveBeenCalled();
    expect(json.results[0].leadId).toBe('lead-1');
    expect(json.results[0].reasons).toContain('Alta afinidade detectada pela Laya');
  });
});
