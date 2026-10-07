import { describe, expect, it } from 'vitest';
import { getPack } from '@/lib/marketing/packs';
import { queueTemplatedVideos } from './queue-templated';

const pack = getPack('barbearia')!;
const acc = 'acc-1';
const photos = (n: number) => Array.from({ length: n }, (_, i) => `account-${acc}/uploads/${i + 1}-a.jpg`);
const fields = { name: 'Degradê navalhado', benefit: 'Acabamento na régua' };
const body = (over: Record<string, unknown> = {}) => ({
  buttonId: 'compilado', fields, imagePaths: photos(4), formats: ['vertical', 'square'], ...over,
});

function fakeDb(countToday = 0, insertError: string | null = null) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ gte: async () => ({ count: countToday, error: null }) }) }),
      insert: (rows: Record<string, unknown>[]) => ({
        select: async () => {
          if (insertError) return { data: null, error: { message: insertError } };
          inserted.push(...rows);
          return { data: rows.map((r, i) => ({ id: `v-${i + 1}`, ...r })), error: null };
        },
      }),
    }),
  };
  return { db: db as never, inserted };
}

const run = (b: unknown, p = pack, db = fakeDb().db) => queueTemplatedVideos(db, acc, 'user-1', b, p);

describe('queueTemplatedVideos', () => {
  it('cria uma linha por formato com os dados do pacote', async () => {
    const { db, inserted } = fakeDb();
    const r = await queueTemplatedVideos(db, acc, 'user-1', body(), pack);
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(2);
    expect(inserted.map((x) => x.format)).toEqual(['vertical', 'square']);
    expect(inserted[0]).toMatchObject({
      account_id: acc, created_by: 'user-1', kind: 'reels', niche: 'barbearia', template_id: 'compilado',
      tone: 'polished', status: 'pending', image_paths: photos(4),
      director_input: { buttonId: 'compilado', fields },
    });
    expect(String(inserted[0].prompt)).toContain('Degradê navalhado');
  });

  it('formatos repetidos viram uma linha só', async () => {
    const { db, inserted } = fakeDb();
    await queueTemplatedVideos(db, acc, null, body({ formats: ['vertical', 'vertical'] }), pack);
    expect(inserted).toHaveLength(1);
  });

  it('400 sem pacote ligado neste CRM', async () => {
    expect(await run(body(), null as never)).toMatchObject({ ok: false, status: 400 });
  });

  it('400 para corpo que não é objeto, botão desconhecido ou de outro nicho', async () => {
    expect(await run('texto')).toMatchObject({ ok: false, status: 400 });
    expect(await run(body({ buttonId: 'inexistente' }))).toMatchObject({ ok: false, status: 400 });
    expect(await run(body({ buttonId: 'tour-do-imovel' }))).toMatchObject({ ok: false, status: 400 });
  });

  it('400 para foto fora da pasta da conta ou com ..', async () => {
    const outside = await run(body({ imagePaths: ['account-other/uploads/1.jpg', ...photos(3)] }));
    expect(outside).toMatchObject({ ok: false, status: 400, error: 'Foto inválida' });
    const dots = await run(body({ imagePaths: [`account-${acc}/uploads/../x.jpg`, ...photos(3)] }));
    expect(dots).toMatchObject({ ok: false, status: 400 });
  });

  it('400 para quantidade de fotos fora da faixa do template', async () => {
    const r = await run(body({ imagePaths: photos(3) }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect((r as { error: string }).error).toContain('de 4 a 10');
  });

  it('400 para número ímpar de fotos no antes e depois', async () => {
    const r = await run(body({ buttonId: 'antes-depois', imagePaths: photos(3) }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect((r as { error: string }).error).toContain('múltiplo de 2');
  });

  it('400 quando falta campo obrigatório do formulário', async () => {
    const r = await run(body({ fields: { benefit: 'só o benefício' } }));
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('400 para campo acima de 200 caracteres e para valor que não é texto', async () => {
    expect(await run(body({ fields: { ...fields, name: 'x'.repeat(201) } }))).toMatchObject({ ok: false, status: 400 });
    expect(await run(body({ fields: { ...fields, name: 42 } }))).toMatchObject({ ok: false, status: 400 });
  });

  it('400 para formatos vazios, desconhecidos ou horizontal', async () => {
    expect(await run(body({ formats: [] }))).toMatchObject({ ok: false, status: 400 });
    expect(await run(body({ formats: ['tiktok'] }))).toMatchObject({ ok: false, status: 400 });
    expect(await run(body({ formats: ['landscape'] }))).toMatchObject({ ok: false, status: 400 });
  });

  it('429 quando os novos vídeos passariam do limite diário (9 hoje + 2 formatos)', async () => {
    const { db, inserted } = fakeDb(9);
    const r = await queueTemplatedVideos(db, acc, null, body(), pack);
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect(inserted).toHaveLength(0);
  });

  it('aceita exatamente até o limite (8 hoje + 2 formatos)', async () => {
    const { db } = fakeDb(8);
    expect((await queueTemplatedVideos(db, acc, null, body(), pack)).ok).toBe(true);
  });

  it('500 quando o banco recusa o insert', async () => {
    const { db } = fakeDb(0, 'boom');
    expect(await queueTemplatedVideos(db, acc, null, body(), pack)).toMatchObject({ ok: false, status: 500 });
  });
});
