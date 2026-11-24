import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isLocalFinanceMode } from './context';
import { createLocalRepository } from './local-repository';
import { clearRateCache } from './rates';
import type { FinanceRepository } from './repository';
import {
  chargeRecurring,
  createEntry,
  createOneTimeIncome,
  FinanceInputError,
  updateEntry,
} from './service';

let dir: string;
let file: string;
let repo: FinanceRepository;

// Cotação fixa: qualquer pedido à AwesomeAPI devolve 5,00 (atual) ou 5,20 (histórica).
const fetcher = vi.fn(async (url: string) => {
  const body = url.includes('/last/')
    ? { USDBRL: { bid: '5.00', create_date: '2026-11-20 10:00:00' } }
    : [
        {
          bid: '5.20',
          timestamp: String(Date.parse('2026-03-10T20:00:00Z') / 1000),
        },
      ];
  return { ok: true, json: async () => body } as Response;
});

beforeEach(async () => {
  clearRateCache();
  dir = await mkdtemp(path.join(tmpdir(), 'fin-'));
  file = path.join(dir, 'financeiro.json');
  repo = createLocalRepository(file);
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

describe('repositório local', () => {
  it('cria o arquivo com as categorias iniciais', async () => {
    const cats = await repo.listCategories();
    expect(cats.map((c) => c.name)).toContain('Assinaturas');
    expect(JSON.parse(await readFile(file, 'utf8')).version).toBe(1);
  });

  it('gravações simultâneas não se perdem', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createEntry(repo, {
          kind: 'expense',
          description: `g${i}`,
          amount_cents: 100,
          currency: 'BRL',
          date: '2026-11-01',
        })
      )
    );
    expect(await repo.listEntries()).toHaveLength(10);
  });

  it('apagar categoria deixa o lançamento sem categoria', async () => {
    const cat = await repo.createCategory({
      name: 'Teste',
      kind: 'expense',
      color: '#000000',
    });
    const e = await createEntry(repo, {
      kind: 'expense',
      description: 'x',
      category_id: cat.id,
      amount_cents: 100,
      currency: 'BRL',
      date: '2026-11-01',
    });
    await repo.deleteCategory(cat.id);
    expect((await repo.getEntry(e.id))?.category_id).toBeNull();
  });
});

describe('serviço', () => {
  it('converte dólar pela cotação do dia do lançamento', async () => {
    const e = await createEntry(
      repo,
      {
        kind: 'expense',
        description: 'Assinatura',
        amount_cents: 2000,
        currency: 'USD',
        date: '2026-03-10',
        actual_brl_cents: 11000,
      },
      {},
      fetcher
    );
    expect(e).toMatchObject({
      rate_to_brl: 5.2,
      rate_source: 'awesomeapi',
      amount_brl_cents: 10400,
      actual_brl_cents: 11000,
    });
  });

  it('cotação manual não chama a rede; real ignora valor de fatura', async () => {
    fetcher.mockClear();
    const e = await createEntry(
      repo,
      {
        kind: 'expense',
        description: 'x',
        amount_cents: 1000,
        currency: 'USD',
        date: '2026-03-10',
        manual_rate: 6,
      },
      {},
      fetcher
    );
    expect(e).toMatchObject({ rate_source: 'manual', amount_brl_cents: 6000 });
    expect(fetcher).not.toHaveBeenCalled();
    const r = await createEntry(repo, {
      kind: 'expense',
      description: 'y',
      amount_cents: 1000,
      currency: 'BRL',
      date: '2026-03-10',
      actual_brl_cents: 999,
    });
    expect(r).toMatchObject({
      rate_to_brl: 1,
      amount_brl_cents: 1000,
      actual_brl_cents: null,
    });
  });

  it('recusa categoria de outro tipo', async () => {
    const income = (await repo.listCategories()).find(
      (c) => c.kind === 'income'
    )!;
    await expect(
      createEntry(repo, {
        kind: 'expense',
        description: 'x',
        category_id: income.id,
        amount_cents: 100,
        currency: 'BRL',
        date: '2026-11-01',
      })
    ).rejects.toBeInstanceOf(FinanceInputError);
  });

  it('editar o valor recalcula; editar a descrição não', async () => {
    const e = await createEntry(
      repo,
      {
        kind: 'expense',
        description: 'x',
        amount_cents: 1000,
        currency: 'USD',
        date: '2026-03-10',
      },
      {},
      fetcher
    );
    const a = await updateEntry(repo, e.id, { description: 'novo' }, fetcher);
    expect(a?.amount_brl_cents).toBe(5200);
    const b = await updateEntry(repo, e.id, { amount_cents: 2000 }, fetcher);
    expect(b?.amount_brl_cents).toBe(10400);
    expect(
      await updateEntry(repo, 'nao-existe', { description: 'x' })
    ).toBeNull();
  });

  it('registrar cobrança cria lançamento e avança o ciclo', async () => {
    const rec = await repo.createRecurring({
      kind: 'expense',
      description: 'Domínio',
      category_id: null,
      amount_cents: 6000,
      currency: 'BRL',
      cycle: 'yearly',
      next_date: '2026-03-10',
      active: true,
      notes: null,
    });
    const { entry, recurring } = await chargeRecurring(repo, rec);
    expect(entry).toMatchObject({
      date: '2026-03-10',
      recurring_id: rec.id,
      amount_brl_cents: 6000,
    });
    expect(recurring?.next_date).toBe('2027-03-10');
    await expect(
      chargeRecurring(repo, { ...rec, active: false })
    ).rejects.toBeInstanceOf(FinanceInputError);
  });
});

describe('pagamento único', () => {
  const input = {
    description: 'Site cliente Y',
    category_id: null,
    amount_cents: 500000,
    currency: 'BRL',
    date: '2026-11-20',
    notes: null,
  };

  it('sem mensal: só o lançamento', async () => {
    const { entry, recurring } = await createOneTimeIncome(repo, {
      ...input,
      monthly: null,
    });
    expect(entry).toMatchObject({
      kind: 'income',
      amount_brl_cents: 500000,
      date: '2026-11-20',
    });
    expect(recurring).toBeNull();
    expect(await repo.listRecurring()).toHaveLength(0);
  });

  it('com mensal: lançamento + fixo mensal de entrada', async () => {
    const { recurring } = await createOneTimeIncome(repo, {
      ...input,
      monthly: { amount_cents: 30000, start_date: '2026-12-20' },
    });
    expect(recurring).toMatchObject({
      kind: 'income',
      cycle: 'monthly',
      amount_cents: 30000,
      next_date: '2026-12-20',
      description: 'Site cliente Y (mensal)',
    });
  });

  it('se o fixo falhar, desfaz o lançamento', async () => {
    const broken = {
      ...repo,
      createRecurring: async () => {
        throw new Error('falhou');
      },
    };
    await expect(
      createOneTimeIncome(broken, {
        ...input,
        monthly: { amount_cents: 30000, start_date: '2026-12-20' },
      })
    ).rejects.toThrow('falhou');
    expect(await repo.listEntries()).toHaveLength(0);
  });
});

it('modo local nunca vale em produção', () => {
  expect(
    isLocalFinanceMode({
      FINANCE_STORAGE: 'local',
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv)
  ).toBe(true);
  expect(
    isLocalFinanceMode({
      FINANCE_STORAGE: 'local',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv)
  ).toBe(false);
  expect(
    isLocalFinanceMode({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)
  ).toBe(false);
});
