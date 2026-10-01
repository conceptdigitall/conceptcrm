import { describe, expect, it, vi } from 'vitest';
import { layaBatch } from './laya-client';

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
});
