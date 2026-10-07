import { describe, expect, it, vi } from 'vitest';
import { runVideoJob } from './video';
import { runTemplatedJob } from './video-template';
import type { MarketingVideo } from '@/types';

vi.mock('./video-template', () => ({ runTemplatedJob: vi.fn().mockResolvedValue(undefined) }));

const video = {
  id: 'v-1', account_id: 'acc-1', prompt: 'Promo', image_paths: ['account-acc-1/uploads/1-a.jpg'],
  format: 'vertical', tone: 'default',
} as MarketingVideo;

const HTML = '```html\n<!doctype html><html><body>ok</body></html>\n```';

function fakeDb() {
  const updates: Record<string, unknown>[] = [];
  const uploads: string[] = [];
  const db = {
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
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
    compose: vi.fn().mockResolvedValue(HTML),
    check: vi.fn().mockResolvedValue({ ok: true, output: '' }),
    render: vi.fn().mockResolvedValue(undefined),
    poster: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('mp4')),
    ...over,
  };
}

describe('runVideoJob', () => {
  it('composes, checks, renders, uploads and finishes', async () => {
    const { db, updates, uploads } = fakeDb();
    const d = deps();
    await runVideoJob(db, video, d);
    expect(d.compose).toHaveBeenCalledTimes(1);
    expect(d.render).toHaveBeenCalledTimes(1);
    expect(uploads).toEqual(['account-acc-1/videos/v-1.mp4', 'account-acc-1/videos/v-1.jpg']);
    expect(updates.at(-1)).toMatchObject({
      status: 'done', video_path: 'account-acc-1/videos/v-1.mp4', poster_path: 'account-acc-1/videos/v-1.jpg',
    });
  });
  it('sends check errors back to Claude and succeeds on the second try', async () => {
    const { db, updates } = fakeDb();
    const d = deps({
      check: vi.fn()
        .mockResolvedValueOnce({ ok: false, output: 'lint: missing data-duration' })
        .mockResolvedValueOnce({ ok: true, output: '' }),
    });
    await runVideoJob(db, video, d);
    expect(d.compose).toHaveBeenCalledTimes(2);
    const secondCallMessages = d.compose.mock.calls[1][0] as { content: string }[];
    expect(secondCallMessages.at(-1)?.content).toContain('missing data-duration');
    expect(updates.at(-1)).toMatchObject({ status: 'done' });
  });
  it('fails after the first attempt plus 2 fixes, with the last check output', async () => {
    const { db, updates } = fakeDb();
    const d = deps({ check: vi.fn().mockResolvedValue({ ok: false, output: 'still broken' }) });
    await runVideoJob(db, video, d);
    expect(d.compose).toHaveBeenCalledTimes(3);
    expect(d.render).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('still broken') });
  });
  it('fails cleanly when Claude returns no html', async () => {
    const { db, updates } = fakeDb();
    const d = deps({ compose: vi.fn().mockResolvedValue('Não consigo ajudar com isso.') });
    await runVideoJob(db, video, d);
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('HTML') });
  });
  it("refuses image paths outside the job's own account folder without downloading", async () => {
    const { db, updates, uploads } = fakeDb();
    const d = deps();
    await runVideoJob(db, { ...video, image_paths: ['account-other/uploads/1-x.jpg'] }, d);
    expect(d.compose).not.toHaveBeenCalled();
    expect(uploads).toEqual([]);
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: 'Foto inválida' });
  });
  it('fails cleanly when rendering throws', async () => {
    const { db, updates } = fakeDb();
    const d = deps({ render: vi.fn().mockRejectedValue(new Error('ffmpeg crashed')) });
    await runVideoJob(db, video, d);
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('ffmpeg crashed') });
  });
  it('delega para o caminho de templates quando o vídeo tem template_id', async () => {
    const { db } = fakeDb();
    const d = deps();
    const templated = { ...video, template_id: 'compilado' } as MarketingVideo;
    await runVideoJob(db, templated, d);
    expect(runTemplatedJob).toHaveBeenCalledWith(db, templated);
    expect(d.compose).not.toHaveBeenCalled();
  });
});
