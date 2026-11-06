import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { requeueOrphaned } from './queue';
import { GeminiQuotaError, claimNextReference, runReferenceTick, type ReferenceDeps } from './references';

type Row = Record<string, unknown>;

function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { marketing_references: [], marketing_settings: [], ...seed };
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'update' = 'select';
    let payload: Row | null = null;
    let max = Infinity;
    const run = () => {
      const matched = tables[name].filter((r) => filters.every((f) => f(r)));
      if (op === 'update') { matched.forEach((r) => Object.assign(r, payload)); return { data: matched, error: null }; }
      return { data: matched.slice(0, max), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: Row) => { op = 'update'; payload = p; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
      // Só o formato 'retry_after.is.null,retry_after.lte.<iso>' usado pelo worker.
      or: (expr: string) => {
        const lte = expr.split(',').find((p) => p.startsWith('retry_after.lte.'))!.slice('retry_after.lte.'.length);
        filters.push((r) => r.retry_after == null || new Date(r.retry_after as string) <= new Date(lte));
        return q;
      },
      order: () => q,
      limit: (n: number) => { max = n; return q; },
      maybeSingle: () => { const { data } = run(); return Promise.resolve({ data: (data as Row[])[0] ?? null, error: null }); },
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return q;
  };
  return { from, tables } as unknown as Parameters<typeof runReferenceTick>[0] & { tables: Record<string, Row[]> };
}

const ACC = 'acc-1';
const NOW = new Date('2026-11-06T12:00:00Z');
const analiseJson = JSON.stringify({
  gancho: { tipo: 'curiosidade', frase: 'Você erra isso', primeiroQuadro: 'Close no rosto' },
  duracaoSeg: 30, cortesPorMinuto: 20, formato: 'pessoa_falando', tema: 'Tema', promessa: 'Promessa',
  entrega: 'Entrega', cta: 'Siga', porQueViralizou: ['a', 'b', 'c'], comoAdaptar: 'Adapte assim',
});

const ref = (over: Row = {}): Row => ({
  id: 'r-1', account_id: ACC, url: 'https://instagram.com/reel/abc', url_normalizada: 'x', plataforma: 'instagram',
  eixo: 'tema', nicho: null, arquivo_path: null, status: 'pending', error: null, started_at: null,
  finished_at: null, retry_after: null, analise: null, created_at: '2026-11-06T10:00:00Z', ...over,
});

function makeDeps(over: Partial<ReferenceDeps> = {}) {
  const dirs: string[] = [];
  const deps = {
    now: () => NOW,
    probeDuration: vi.fn(async () => 60),
    probeFileDuration: vi.fn(async () => 60),
    download: vi.fn(async (_u: string, dir: string) => { dirs.push(dir); return join(dir, 'v.mp4'); }),
    downloadUpload: vi.fn(async (_p: string, dir: string) => { dirs.push(dir); return join(dir, 'u.mp4'); }),
    removeUpload: vi.fn(async () => {}),
    analyze: vi.fn(async () => analiseJson),
    ...over,
  } satisfies ReferenceDeps;
  return { deps, dirs };
}

describe('runReferenceTick', () => {
  it('caminho feliz: done, análise gravada, pasta temporária apagada', async () => {
    const db = fakeDb({ marketing_references: [ref()] });
    const { deps, dirs } = makeDeps();
    expect(await runReferenceTick(db, [ACC], deps)).toBe(true);
    const r = db.tables.marketing_references[0];
    expect(r.status).toBe('done');
    expect((r.analise as Row).tema).toBe('Tema');
    expect(dirs).toHaveLength(1);
    expect(existsSync(dirs[0])).toBe(false);
  });

  it('sem fila devolve false', async () => {
    expect(await runReferenceTick(fakeDb(), [ACC], makeDeps().deps)).toBe(false);
  });

  it('usa o nome do negócio das configurações no prompt', async () => {
    const db = fakeDb({ marketing_references: [ref()], marketing_settings: [{ account_id: ACC, business_name: 'Padaria Sol' }] });
    const analyze = vi.fn(async (_v: string, _p: string) => analiseJson);
    const { deps } = makeDeps({ analyze });
    await runReferenceTick(db, [ACC], deps);
    expect(analyze.mock.calls[0][1]).toContain('Padaria Sol');
  });

  it('link usa a URL normalizada (yt-dlp só entende www.tiktok.com)', async () => {
    const db = fakeDb({ marketing_references: [ref({
      url: 'https://tiktok.com/@u/video/1', url_normalizada: 'https://www.tiktok.com/@u/video/1',
    })] });
    const { deps } = makeDeps();
    await runReferenceTick(db, [ACC], deps);
    expect(deps.probeDuration).toHaveBeenCalledWith('https://www.tiktok.com/@u/video/1');
    expect(deps.download).toHaveBeenCalledWith('https://www.tiktok.com/@u/video/1', expect.any(String));
  });
  it('link com 200 s: failed "vídeo longo demais" e nunca baixa', async () => {
    const db = fakeDb({ marketing_references: [ref()] });
    const { deps } = makeDeps({ probeDuration: vi.fn(async () => 200) });
    await runReferenceTick(db, [ACC], deps);
    expect(db.tables.marketing_references[0]).toMatchObject({ status: 'failed', error: 'vídeo longo demais' });
    expect(deps.download).not.toHaveBeenCalled();
  });

  it('upload longo: failed "vídeo longo demais" e removeUpload chamado', async () => {
    const db = fakeDb({ marketing_references: [ref({ url: 'upload:r-1', arquivo_path: 'a/r-1.mp4' })] });
    const { deps, dirs } = makeDeps({ probeFileDuration: vi.fn(async () => 200) });
    await runReferenceTick(db, [ACC], deps);
    expect(db.tables.marketing_references[0]).toMatchObject({ status: 'failed', error: 'vídeo longo demais', arquivo_path: null });
    expect(deps.removeUpload).toHaveBeenCalledWith('a/r-1.mp4');
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(existsSync(dirs[0])).toBe(false);
  });

  it('download falha: "envie o arquivo do vídeo"', async () => {
    const db = fakeDb({ marketing_references: [ref()] });
    const { deps } = makeDeps({ download: vi.fn(async () => { throw new Error('yt-dlp 403'); }) });
    await runReferenceTick(db, [ACC], deps);
    expect(db.tables.marketing_references[0]).toMatchObject({ status: 'failed', error: 'envie o arquivo do vídeo' });
  });

  it('cota do Gemini: volta a pending com retry_after = agora + 1 h e respeita a espera', async () => {
    const db = fakeDb({ marketing_references: [ref()] });
    const { deps } = makeDeps({ analyze: vi.fn(async () => { throw new GeminiQuotaError('429'); }) });
    expect(await runReferenceTick(db, [ACC], deps)).toBe(true);
    const r = db.tables.marketing_references[0];
    expect(r).toMatchObject({ status: 'pending', started_at: null, retry_after: '2026-11-06T13:00:00.000Z' });
    expect(await claimNextReference(db, [ACC], new Date(NOW.getTime() + 30 * 60_000))).toBeNull();
    const again = await claimNextReference(db, [ACC], new Date(NOW.getTime() + 61 * 60_000));
    expect(again?.id).toBe('r-1');
    expect(again?.status).toBe('running');
  });

  it('JSON inválido duas vezes: "análise falhou"', async () => {
    const db = fakeDb({ marketing_references: [ref()] });
    const { deps } = makeDeps({ analyze: vi.fn(async () => 'lixo') });
    await runReferenceTick(db, [ACC], deps);
    expect(deps.analyze).toHaveBeenCalledTimes(2);
    expect(db.tables.marketing_references[0]).toMatchObject({ status: 'failed', error: 'análise falhou' });
  });

  it('inválido e depois válido: done com exatamente 2 chamadas', async () => {
    const db = fakeDb({ marketing_references: [ref()] });
    const analyze = vi.fn().mockResolvedValueOnce('lixo').mockResolvedValueOnce(analiseJson);
    const { deps } = makeDeps({ analyze });
    await runReferenceTick(db, [ACC], deps);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(db.tables.marketing_references[0].status).toBe('done');
  });

  it('upload: usa downloadUpload e remove o arquivo no done e no failed', async () => {
    for (const ok of [true, false]) {
      const db = fakeDb({ marketing_references: [ref({ url: 'upload:r-1', arquivo_path: 'a/r-1.mp4' })] });
      const { deps } = makeDeps({ analyze: vi.fn(async () => (ok ? analiseJson : 'lixo')) });
      await runReferenceTick(db, [ACC], deps);
      const r = db.tables.marketing_references[0];
      expect(r.status).toBe(ok ? 'done' : 'failed');
      expect(r.arquivo_path).toBeNull();
      expect(deps.downloadUpload).toHaveBeenCalled();
      expect(deps.download).not.toHaveBeenCalled();
      expect(deps.removeUpload).toHaveBeenCalledWith('a/r-1.mp4');
    }
  });

  it('erro genérico no analyze: failed curto e pasta apagada', async () => {
    const db = fakeDb({ marketing_references: [ref()] });
    const { deps, dirs } = makeDeps({ analyze: vi.fn(async () => { throw new Error('kaboom\n  at stack'); }) });
    await runReferenceTick(db, [ACC], deps);
    const r = db.tables.marketing_references[0];
    expect(r.status).toBe('failed');
    expect(String(r.error)).not.toContain('stack');
    expect(existsSync(dirs[0])).toBe(false);
  });
});

describe('requeueOrphaned', () => {
  it('devolve referência running para pending', async () => {
    const db = fakeDb({ marketing_references: [ref({ status: 'running' })] });
    expect(await requeueOrphaned(db, 'marketing_references')).toBe(1);
    expect(db.tables.marketing_references[0].status).toBe('pending');
  });
});
