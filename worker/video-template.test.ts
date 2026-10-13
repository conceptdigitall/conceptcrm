import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { MarketingVideo } from '@/types';
import { DirectorError } from './director';
import { runTemplatedJob } from './video-template';

const good = {
  templateId: 'compilado',
  photoOrder: [3, 2, 1, 0],
  texts: { titulo: 'Degradê na régua', subtitulo: 'Acabamento', cta: 'Agende' },
  caption: 'Legenda pronta.',
  hashtags: ['#barbearia', '#corte'],
};

const video = {
  id: 'v-1', account_id: 'acc-1', prompt: 'x', format: 'vertical', tone: 'polished', kind: 'reels',
  niche: 'barbearia', template_id: 'compilado',
  director_input: { buttonId: 'compilado', fields: { name: 'Degradê' } },
  image_paths: [1, 2, 3, 4].map((n) => `account-acc-1/uploads/${n}-a.jpg`),
} as unknown as MarketingVideo;

async function fakeDb(size = { width: 1080, height: 1350 }) {
  const img = await sharp({ create: { ...size, channels: 3, background: '#888' } }).jpeg().toBuffer();
  const updates: Record<string, unknown>[] = [];
  const uploads: string[] = [];
  const db = {
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array(img)]), error: null }),
        upload: async (path: string) => { uploads.push(path); return { error: null }; },
      }),
    },
    from: () => ({
      update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
    }),
  };
  return { db: db as never, updates, uploads };
}

function deps(over: Record<string, unknown> = {}) {
  return {
    classify: vi.fn().mockResolvedValue(['ok', 'ok', 'ok', 'ok']),
    ask: vi.fn().mockResolvedValue('```json\n' + JSON.stringify(good) + '\n```'),
    check: vi.fn().mockResolvedValue({ ok: true, output: '' }),
    render: vi.fn().mockResolvedValue(undefined),
    poster: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('mp4')),
    loadComposition: vi.fn().mockResolvedValue('<html>{{text.titulo}}{{text.subtitulo}}{{text.cta}}{{#photos}}<img src="{{src}}">{{/photos}}</html>'),
    accountName: vi.fn().mockResolvedValue('Barbearia do Alemão'),
    ...over,
  };
}

describe('runTemplatedJob', () => {
  it('caminho feliz: grava done, legenda com hashtags e saída do diretor', async () => {
    const { db, updates, uploads } = await fakeDb();
    const d = deps();
    await runTemplatedJob(db, video, d);
    expect(uploads).toEqual(['account-acc-1/videos/v-1.mp4', 'account-acc-1/videos/v-1.jpg']);
    expect(updates.at(-1)).toMatchObject({
      status: 'done',
      video_path: 'account-acc-1/videos/v-1.mp4',
      poster_path: 'account-acc-1/videos/v-1.jpg',
      caption: 'Legenda pronta.\n\n#barbearia #corte',
      director_output: good,
    });
  });

  it('preenche a composição na ordem escolhida pelo diretor', async () => {
    const { db } = await fakeDb();
    const d = deps();
    let written = '';
    d.check.mockImplementation(async (dir: string) => {
      const { readFile } = await import('node:fs/promises');
      written = await readFile(`${dir}/index.html`, 'utf8');
      return { ok: true, output: '' };
    });
    await runTemplatedJob(db, video, d);
    const order = [...written.matchAll(/assets\/img-(\d)\./g)].map((m) => m[1]);
    expect(order).toEqual(['4', '3', '2', '1']);
    expect(written).toContain('Degradê na régua');
  });

  it('foto pequena: falha com error_kind photos, sem chamar visão, diretor nem render', async () => {
    const { db, updates } = await fakeDb({ width: 500, height: 500 });
    const d = deps();
    await runTemplatedJob(db, video, d);
    expect(updates.at(-1)).toMatchObject({
      status: 'failed', error_kind: 'photos', error: expect.stringContaining('pequena demais'),
    });
    expect(d.classify).not.toHaveBeenCalled();
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.render).not.toHaveBeenCalled();
  });

  it('foto escura: falha com error_kind photos e não chama diretor nem render', async () => {
    const { db, updates } = await fakeDb();
    const d = deps({ classify: vi.fn().mockResolvedValue(['ok', 'escura', 'ok', 'ok']) });
    await runTemplatedJob(db, video, d);
    expect(updates.at(-1)).toMatchObject({
      status: 'failed', error_kind: 'photos', error: 'A foto 2 está escura, quer trocar?',
    });
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.render).not.toHaveBeenCalled();
  });

  it('diretor inválido duas vezes: failed com error_kind director', async () => {
    const { db, updates } = await fakeDb();
    const d = deps({ ask: vi.fn().mockResolvedValue('nada de json') });
    await runTemplatedJob(db, video, d);
    expect(d.ask).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)).toMatchObject({
      status: 'failed', error_kind: 'director', error: new DirectorError().message,
    });
    expect(d.render).not.toHaveBeenCalled();
  });

  it('falha no render: error_kind render com mensagem em português, após repetir 1 vez', async () => {
    const { db, updates } = await fakeDb();
    const d = deps({ render: vi.fn().mockRejectedValue(new Error('ffmpeg crashed')) });
    await runTemplatedJob(db, video, d);
    expect(d.render).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)).toMatchObject({
      status: 'failed', error_kind: 'render', error: expect.stringContaining('vídeo'),
    });
  });

  it('check que falha uma vez por rede e passa na segunda não derruba o job', async () => {
    const { db, updates } = await fakeDb();
    const d = deps({
      check: vi.fn().mockResolvedValueOnce({ ok: false, output: 'net error' }).mockResolvedValueOnce({ ok: true, output: '' }),
    });
    await runTemplatedJob(db, video, d);
    expect(d.check).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)).toMatchObject({ status: 'done' });
  });

  it('recusa caminhos fora da pasta da conta sem baixar nem chamar a IA', async () => {
    const { db, updates, uploads } = await fakeDb();
    const d = deps();
    await runTemplatedJob(db, { ...video, image_paths: ['account-other/uploads/1-x.jpg'] } as MarketingVideo, d);
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: 'Foto inválida' });
    expect(d.classify).not.toHaveBeenCalled();
    expect(uploads).toEqual([]);
  });

  it('nicho ou botão desconhecido: failed com error_kind director', async () => {
    const { db, updates } = await fakeDb();
    await runTemplatedJob(db, { ...video, niche: 'imobiliaria' } as MarketingVideo, deps());
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error_kind: 'director' });
  });

  it('formato horizontal não é aceito em Reels', async () => {
    const { db, updates } = await fakeDb();
    await runTemplatedJob(db, { ...video, format: 'landscape' } as MarketingVideo, deps());
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error_kind: 'render' });
  });
});
