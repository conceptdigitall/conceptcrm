import { describe, expect, it, vi } from 'vitest';
import { runPautaTick, slotDoFormato } from './pauta';

type Row = Record<string, unknown>;

// Banco falso em memória: só o que o worker da pauta usa.
function fakeDb(seed: Record<string, Row[]> = {}, failOn: (table: string, op: string) => boolean = () => false) {
  const tables: Record<string, Row[]> = {
    marketing_pautas: [], marketing_pauta_itens: [], marketing_videos: [],
    marketing_posts: [], marketing_settings: [], marketing_projects: [], ...seed,
  };
  let seq = 0;
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let max = Infinity;
    const run = () => {
      const t = tables[name];
      if (failOn(name, op)) return { data: null, error: { message: 'boom' } };
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const made: Row[] = list.map((p) => ({ id: `id-${++seq}`, ...p }));
        if (name === 'marketing_pautas' && made.some((m) => t.some((r) => r.account_id === m.account_id && r.semana_inicio === m.semana_inicio))) {
          return { data: null, error: { message: 'duplicate key' } };
        }
        t.push(...made);
        return { data: made, error: null };
      }
      const matched = t.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') { matched.forEach((r) => Object.assign(r, payload)); return { data: matched, error: null }; }
      if (op === 'delete') { tables[name] = t.filter((r) => !matched.includes(r)); return { data: matched, error: null }; }
      return { data: matched.slice(0, max), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return q; },
      update: (p: Row) => { op = 'update'; payload = p; return q; },
      delete: () => { op = 'delete'; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
      order: () => q,
      limit: (n: number) => { max = n; return q; },
      maybeSingle: () => { const { data, error } = run(); return Promise.resolve({ data: (data as Row[] | null)?.[0] ?? null, error }); },
      single: () => { const { data, error } = run(); return Promise.resolve({ data: (data as Row[] | null)?.[0] ?? null, error }); },
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return q;
  };
  return { from, tables } as unknown as Parameters<typeof runPautaTick>[0] & { tables: Record<string, Row[]> };
}

const ACC = 'acc-1';
// 2026-10-26 é segunda-feira. 07:00 BRT = 10:00 UTC.
const SEG_0659 = new Date('2026-10-26T09:59:00Z');
const SEG_0700 = new Date('2026-10-26T10:00:00Z');
const QUA = new Date('2026-10-28T15:00:00Z');

const pautaJson = (n = 6) => JSON.stringify({
  itens: Array.from({ length: n }, (_, i) => ({
    dia: `2026-10-${26 + (i % 7)}`, formato: ['feed', 'story', 'reel'][i % 3],
    tema: `Tema ${i}`, gancho: `Gancho ${i}`, roteiro: 'Cena 1\nCena 2', legenda_base: `Legenda ${i}`,
  })),
});

const deps = (now: Date, text: string | (() => string)) => {
  const generateText = vi.fn(async () => (typeof text === 'function' ? text() : text));
  return { now: () => now, generateText };
};

const item = (over: Row): Row => ({
  id: 'it-1', pauta_id: 'p-1', account_id: ACC, dia: '2026-10-27', formato: 'feed',
  tema: 'T', gancho: 'G', roteiro: 'R', legenda_base: 'L', status: 'pending_approval',
  comentario: null, versao: 1, post_id: null, ...over,
});

describe('runPautaTick', () => {
  it('segunda 06:59 BRT sem pauta não faz nada; 07:00 cria pauta e 6 itens', async () => {
    const db = fakeDb();
    const d1 = deps(SEG_0659, pautaJson());
    expect(await runPautaTick(db, [ACC], d1)).toBe(false);
    expect(d1.generateText).not.toHaveBeenCalled();
    expect(db.tables.marketing_pautas).toHaveLength(0);

    const d2 = deps(SEG_0700, pautaJson());
    expect(await runPautaTick(db, [ACC], d2)).toBe(true);
    expect(db.tables.marketing_pautas).toHaveLength(1);
    expect(db.tables.marketing_pautas[0]).toMatchObject({ semana_inicio: '2026-10-26', status: 'pending_approval' });
    expect(db.tables.marketing_pauta_itens).toHaveLength(6);
    expect(db.tables.marketing_pauta_itens[0]).toMatchObject({ status: 'pending_approval', account_id: ACC });
  });

  it('quarta sem pauta da semana gera; com pauta da semana não gera de novo', async () => {
    const db = fakeDb();
    const d = deps(QUA, pautaJson());
    expect(await runPautaTick(db, [ACC], d)).toBe(true);
    expect(d.generateText).toHaveBeenCalledTimes(1);
    // Itens ainda pendentes: nada a fazer.
    expect(await runPautaTick(db, [ACC], d)).toBe(false);
    expect(d.generateText).toHaveBeenCalledTimes(1);
  });

  it('pauta criada pela API (gerando, sem itens) é preenchida', async () => {
    const db = fakeDb({ marketing_pautas: [{ id: 'p-1', account_id: ACC, semana_inicio: '2026-10-26', status: 'gerando' }] });
    expect(await runPautaTick(db, [ACC], deps(SEG_0659, pautaJson()))).toBe(true);
    expect(db.tables.marketing_pauta_itens).toHaveLength(6);
    expect(db.tables.marketing_pautas).toHaveLength(1);
    expect(db.tables.marketing_pautas[0].status).toBe('pending_approval');
  });

  it('IA com 4 itens: nada gravado, pauta segue gerando, só tenta de novo após 1 h', async () => {
    const db = fakeDb();
    const t0 = new Date('2026-10-28T12:00:00Z');
    const bad = deps(t0, pautaJson(4));
    expect(await runPautaTick(db, [ACC], bad)).toBe(false);
    expect(db.tables.marketing_pauta_itens).toHaveLength(0);
    expect(db.tables.marketing_pautas[0].status).toBe('gerando');
    expect(bad.generateText).toHaveBeenCalledTimes(1);

    const at59 = deps(new Date(t0.getTime() + 59 * 60_000), pautaJson());
    await runPautaTick(db, [ACC], at59);
    expect(at59.generateText).not.toHaveBeenCalled();

    const at61 = deps(new Date(t0.getTime() + 61 * 60_000), pautaJson());
    expect(await runPautaTick(db, [ACC], at61)).toBe(true);
    expect(at61.generateText).toHaveBeenCalledTimes(1);
    expect(db.tables.marketing_pauta_itens).toHaveLength(6);
  });

  it('item aprovado sem post vira vídeo da pauta + post draft e grava post_id', async () => {
    const db = fakeDb({
      marketing_pautas: [{ id: 'p-1', account_id: ACC, semana_inicio: '2026-10-26', status: 'pending_approval' }],
      marketing_pauta_itens: [item({ status: 'aprovado', formato: 'reel', tema: 'Meu tema', gancho: 'Meu gancho', roteiro: 'Cenas', legenda_base: 'Minha legenda' })],
    });
    const d = deps(QUA, '');
    expect(await runPautaTick(db, [ACC], d)).toBe(true);
    expect(d.generateText).not.toHaveBeenCalled();
    const video = db.tables.marketing_videos[0];
    expect((video.director_input as Row).pauta).toBe(true);
    expect((video.director_input as Row).autopilot).toBeUndefined();
    expect(video.prompt).toContain('Meu gancho');
    expect(video.prompt).toContain('Cenas');
    const post = db.tables.marketing_posts[0];
    expect(post).toMatchObject({ status: 'draft', title: 'Meu tema', caption: 'Minha legenda', video_id: video.id });
    expect(db.tables.marketing_pauta_itens[0].post_id).toBe(post.id);
  });

  it('item em ajuste é reescrito: versão 2, pending_approval, comentário nulo', async () => {
    const db = fakeDb({
      marketing_pautas: [{ id: 'p-1', account_id: ACC, semana_inicio: '2026-10-26', status: 'pending_approval' }],
      marketing_pauta_itens: [item({ status: 'ajuste', comentario: 'mais curto' })],
    });
    const novo = JSON.stringify({ tema: 'Novo', gancho: 'G2', roteiro: 'R2', legenda_base: 'L2' });
    const d = deps(QUA, novo);
    expect(await runPautaTick(db, [ACC], d)).toBe(true);
    expect(db.tables.marketing_pauta_itens[0]).toMatchObject({
      tema: 'Novo', versao: 2, status: 'pending_approval', comentario: null,
    });
    expect(typeof db.tables.marketing_pauta_itens[0].updated_at).toBe('string');
  });

  it('falha na reescrita não grava nada e espera 1 h', async () => {
    const db = fakeDb({
      marketing_pautas: [{ id: 'p-1', account_id: ACC, semana_inicio: '2026-10-26', status: 'pending_approval' }],
      marketing_pauta_itens: [item({ status: 'ajuste', comentario: 'x' })],
    });
    const d = deps(QUA, 'lixo');
    expect(await runPautaTick(db, [ACC], d)).toBe(false);
    expect(db.tables.marketing_pauta_itens[0]).toMatchObject({ status: 'ajuste', versao: 1 });
    const cedo = deps(new Date(QUA.getTime() + 30 * 60_000), novoOk());
    expect(await runPautaTick(db, [ACC], cedo)).toBe(false);
    expect(cedo.generateText).not.toHaveBeenCalled();
    const tarde = deps(new Date(QUA.getTime() + 61 * 60_000), novoOk());
    expect(await runPautaTick(db, [ACC], tarde)).toBe(true);
    expect(db.tables.marketing_pauta_itens[0]).toMatchObject({ versao: 2, status: 'pending_approval' });
  });

  it('todos decididos: pauta fechada', async () => {
    const db = fakeDb({
      marketing_pautas: [{ id: 'p-1', account_id: ACC, semana_inicio: '2026-10-26', status: 'pending_approval' }],
      marketing_pauta_itens: [
        item({ id: 'a', status: 'aprovado', post_id: 'post-1' }),
        item({ id: 'b', status: 'recusado' }),
      ],
    });
    expect(await runPautaTick(db, [ACC], deps(QUA, ''))).toBe(true);
    expect(db.tables.marketing_pautas[0].status).toBe('fechada');
  });
});

function novoOk() {
  return JSON.stringify({ tema: 'N', gancho: 'G', roteiro: 'R', legenda_base: 'L' });
}

describe('slotDoFormato', () => {
  it('mapeia formato para mídia, com options.pauta e sem autopilot', () => {
    const feed = slotDoFormato('feed', 0);
    expect(feed).toMatchObject({ kind: 'feed', mediaType: 'foto', format: 'square' });
    expect(feed.options).toMatchObject({ still: true, duration: 15, pauta: true });
    const reel = slotDoFormato('reel', 1);
    expect(reel).toMatchObject({ kind: 'feed', mediaType: 'video', format: 'vertical' });
    expect(reel.options).toMatchObject({ duration: 30, target: 'reels', pauta: true });
    const story = slotDoFormato('story', 2);
    expect(story).toMatchObject({ kind: 'story', mediaType: 'video', format: 'vertical' });
    expect(story.options).toMatchObject({ duration: 15, target: 'story', pauta: true });
    expect('autopilot' in story.options).toBe(false);
  });
});

describe('falhas parciais', () => {
  const pautaAberta = { id: 'p-1', account_id: 'acc-f1', semana_inicio: '2026-10-26', status: 'pending_approval' };

  it('post_id não gravado: desfaz vídeo e post (sem duplicar produção)', async () => {
    const db = fakeDb({
      marketing_pautas: [pautaAberta],
      marketing_pauta_itens: [item({ account_id: 'acc-f1', status: 'aprovado' })],
    }, (t, op) => t === 'marketing_pauta_itens' && op === 'update');
    await runPautaTick(db, ['acc-f1'], deps(QUA, ''));
    expect(db.tables.marketing_videos).toHaveLength(0);
    expect(db.tables.marketing_posts).toHaveLength(0);
    expect(db.tables.marketing_pauta_itens[0].post_id ?? null).toBeNull();
  });

  it('item já ligado por outro passe (zero linhas): desfaz também', async () => {
    const it = item({ account_id: 'acc-f2', status: 'aprovado' });
    const db = fakeDb({ marketing_pautas: [{ ...pautaAberta, account_id: 'acc-f2' }], marketing_pauta_itens: [it] });
    // Simula corrida: o post_id aparece logo depois da leitura inicial.
    const orig = db.from.bind(db);
    let first = true;
    (db as unknown as { from: unknown }).from = (n: string) => {
      const q = orig(n);
      if (n === 'marketing_pauta_itens' && !first) it.post_id = 'outro';
      if (n === 'marketing_pauta_itens') first = false;
      return q;
    };
    await runPautaTick(db, ['acc-f2'], deps(QUA, ''));
    expect(db.tables.marketing_videos).toHaveLength(0);
    expect(db.tables.marketing_posts).toHaveLength(0);
  });

  it('item aprovado que falha não bloqueia ajuste nem geração (sem backoff)', async () => {
    const db = fakeDb({
      marketing_pautas: [{ ...pautaAberta, account_id: 'acc-f3' }],
      marketing_pauta_itens: [
        item({ id: 'ap', account_id: 'acc-f3', status: 'aprovado' }),
        item({ id: 'aj', account_id: 'acc-f3', status: 'ajuste', comentario: 'x' }),
      ],
    }, (t, op) => t === 'marketing_videos' && op === 'insert');
    const d = deps(QUA, novoOk());
    expect(await runPautaTick(db, ['acc-f3'], d)).toBe(true);
    expect(d.generateText).toHaveBeenCalledTimes(1);
    expect(db.tables.marketing_pauta_itens.find((r) => r.id === 'aj')).toMatchObject({ versao: 2 });
  });

  it('falha ao liberar a pauta apaga os itens inseridos', async () => {
    const db = fakeDb({}, (t, op) => t === 'marketing_pautas' && op === 'update');
    expect(await runPautaTick(db, ['acc-f4'], deps(QUA, pautaJson()))).toBe(false);
    expect(db.tables.marketing_pauta_itens).toHaveLength(0);
    expect(db.tables.marketing_pautas[0].status).toBe('gerando');
  });
});
