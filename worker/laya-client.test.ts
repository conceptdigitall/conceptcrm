import { describe, expect, it, vi } from 'vitest';
import { EMBED_BATCH, layaBatch, layaEmbed } from './laya-client';

const question = { type: 'noul' as const, instructions: 'Tem site?' };
const ok = (answers: unknown[]) =>
  new Response(JSON.stringify({ results: answers.map((a) => ({ answers: { col: a } })) }), { status: 200 });

describe('layaBatch', () => {
  it('posts states and the question to /v1/systemone/batch and returns answers in order', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([{ noul: 0.9 }, { noul: 0.1 }]));
    const answers = await layaBatch('http://127.0.0.1:8765/', ['a', 'b'], question, { fetchImpl });
    expect(answers).toEqual([{ noul: 0.9 }, { noul: 0.1 }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/v1/systemone/batch');
    expect(JSON.parse(init.body)).toEqual({ states: ['a', 'b'], questions: { col: question }, model: 'multilingual' });
  });
  it('says Laya is off when the connection is refused', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl })).rejects.toThrow('Laya desligado: rode npm run laya');
  });
  it('waits Retry-After seconds on 503 and tries again', async () => {
    const busy = new Response('busy', { status: 503, headers: { 'Retry-After': '2' } });
    const fetchImpl = vi.fn().mockResolvedValueOnce(busy).mockResolvedValueOnce(ok([{ noul: 0.7 }]));
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await layaBatch('http://x', ['a'], question, { fetchImpl, sleep })).toEqual([{ noul: 0.7 }]);
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it('gives up after 3 busy answers', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('busy', { status: 503 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl, sleep }))
      .rejects.toThrow('Laya ocupado: tente de novo em instantes');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('reports other HTTP errors with the status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('too many states', { status: 413 }));
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl })).rejects.toThrow('Laya respondeu 413: too many states');
  });
  it('refuses a reply with fewer answers than states', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([{ noul: 0.9 }]));
    await expect(layaBatch('http://x', ['a', 'b'], question, { fetchImpl }))
      .rejects.toThrow('Laya devolveu 1 respostas para 2 linhas');
  });
  it('refuses a result without the column', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ answers: {} }] })));
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl })).rejects.toThrow('Resposta do Laya sem a coluna');
  });
  it('sends the API key as a Bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([{ noul: 0.5 }]));
    await layaBatch('http://x', ['a'], question, { fetchImpl, apiKey: 'segredo' });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer segredo');
  });
  it('explains a rejected key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('no', { status: 401 }));
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl, apiKey: 'errada' })).rejects.toThrow('Laya recusou a chave');
  });
  it('reports a timeout instead of hanging', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl, timeoutMs: 10 })).rejects.toThrow('Laya não respondeu a tempo');
  });
});

describe('layaEmbed', () => {
  const vectors = (n: number) => new Response(JSON.stringify({ vectors: Array.from({ length: n }, (_, i) => [i, 1]) }), { status: 200 });

  it('posts texts to /v1/embed in batches and keeps the order', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: { body: string }) =>
      vectors(JSON.parse(init.body).texts.length));
    const texts = Array.from({ length: EMBED_BATCH + 3 }, (_, i) => `t${i}`);
    const out = await layaEmbed('http://x/', texts, { fetchImpl });
    expect(out).toHaveLength(EMBED_BATCH + 3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://x/v1/embed');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).texts).toEqual(['t32', 't33', 't34']);
  });
  it('fails when the count does not match', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(vectors(1));
    await expect(layaEmbed('http://x', ['a', 'b'], { fetchImpl })).rejects.toThrow('1 vetores para 2 textos');
  });
  it('explains a server without the embed route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(layaEmbed('http://x', ['a'], { fetchImpl })).rejects.toThrow('sem a rota /v1/embed');
  });
});
