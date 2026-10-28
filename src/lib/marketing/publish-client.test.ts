import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublishTimeoutError, startPublish, waitForPublish } from './publish-client';

const progress = (over: Record<string, unknown> = {}) => ({
  status: 'publishing',
  error_message: null,
  instagram_media_id: null,
  instagram_permalink: null,
  posted_at: null,
  stale: false,
  ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('startPublish', () => {
  it('lança a mensagem da rota quando recusa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Este post já está sendo publicado.' }, 409)));
    await expect(startPublish('p-1')).rejects.toThrow('Este post já está sendo publicado.');
  });

  it('aceita o 202', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 'publishing' }, 202)));
    await expect(startPublish('p-1')).resolves.toBeUndefined();
  });
});

describe('waitForPublish', () => {
  it('consulta até o post ser publicado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(progress()))
      .mockResolvedValueOnce(json(progress()))
      .mockResolvedValueOnce(json(progress({ status: 'published', instagram_media_id: 'm-1' })));
    vi.stubGlobal('fetch', fetchMock);
    const result = await waitForPublish('p-1', { intervalMs: 1 });
    expect(result.status).toBe('published');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('devolve o motivo quando a Meta recusou', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(progress({ status: 'pending_approval', error_message: 'Token expirou' }))),
    );
    const result = await waitForPublish('p-1', { intervalMs: 1 });
    expect(result).toMatchObject({ status: 'pending_approval', error_message: 'Token expirou' });
  });

  it('para quando a publicação ficou presa no servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(progress({ stale: true }))));
    expect((await waitForPublish('p-1', { intervalMs: 1 })).stale).toBe(true);
  });

  it('falha de rede no meio não derruba: tenta de novo', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(json(progress({ status: 'published' })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await waitForPublish('p-1', { intervalMs: 1 })).status).toBe('published');
  });

  it('desiste com aviso claro depois do prazo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(progress())));
    await expect(waitForPublish('p-1', { intervalMs: 1, timeoutMs: 20 })).rejects.toBeInstanceOf(PublishTimeoutError);
  });
});
