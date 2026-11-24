// Armazenamento em arquivo JSON para uso local, de uma pessoa só.
// Gravações em fila (uma por vez) e atômicas (escreve .tmp e renomeia), para
// que dois cliques rápidos não percam dados nem deixem o arquivo pela metade.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_CATEGORIES } from './defaults';
import type {
  CategoryPatch, EntryFilter, EntryPatch, FinanceRepository, NewCategory, NewEntry, NewRecurring, RecurringPatch,
} from './repository';
import type { FinanceCategory, FinanceEntry, FinanceRecurring } from './types';

interface FileData {
  version: 1;
  categories: FinanceCategory[];
  entries: FinanceEntry[];
  recurring: FinanceRecurring[];
}

function seed(now: string): FileData {
  return {
    version: 1,
    categories: DEFAULT_CATEGORIES.map((c) => ({ id: randomUUID(), ...c, archived: false, created_at: now })),
    entries: [],
    recurring: [],
  };
}

export function createLocalRepository(filePath: string): FinanceRepository {
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<FileData> {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as FileData;
      if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) throw new Error(`Arquivo financeiro inválido: ${filePath}`);
      return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
      const fresh = seed(new Date().toISOString());
      await save(fresh);
      return fresh;
    }
  }

  async function save(data: FileData): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, filePath);
  }

  /** Lê, aplica a mudança e grava, uma operação por vez. */
  function mutate<T>(fn: (data: FileData, now: string) => T): Promise<T> {
    const run = queue.then(async () => {
      const data = await load();
      const result = fn(data, new Date().toISOString());
      await save(data);
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  function read<T>(fn: (data: FileData) => T): Promise<T> {
    const run = queue.then(async () => fn(await load()));
    queue = run.catch(() => undefined);
    return run;
  }

  function patchById<T extends { id: string }>(list: T[], id: string, patch: object, extra: object = {}): T | null {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, ...extra, id } as T;
    return list[i];
  }

  function removeById<T extends { id: string }>(list: T[], id: string): boolean {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  return {
    listCategories: () => read((d) => [...d.categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),

    createCategory: (input: NewCategory) =>
      mutate((d, now) => {
        const row: FinanceCategory = { id: randomUUID(), ...input, archived: false, created_at: now };
        d.categories.push(row);
        return row;
      }),

    updateCategory: (id: string, patch: CategoryPatch) => mutate((d) => patchById(d.categories, id, patch)),

    deleteCategory: (id: string) =>
      mutate((d) => {
        const ok = removeById(d.categories, id);
        if (ok) {
          for (const e of d.entries) if (e.category_id === id) e.category_id = null;
          for (const r of d.recurring) if (r.category_id === id) r.category_id = null;
        }
        return ok;
      }),

    listEntries: (filter: EntryFilter = {}) =>
      read((d) =>
        d.entries
          .filter((e) => (!filter.from || e.date >= filter.from) && (!filter.to || e.date <= filter.to))
          .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
      ),

    getEntry: (id: string) => read((d) => d.entries.find((e) => e.id === id) ?? null),

    createEntry: (input: NewEntry) =>
      mutate((d, now) => {
        const row: FinanceEntry = { id: randomUUID(), ...input, created_at: now, updated_at: now };
        d.entries.push(row);
        return row;
      }),

    updateEntry: (id: string, patch: EntryPatch) => mutate((d, now) => patchById(d.entries, id, patch, { updated_at: now })),

    deleteEntry: (id: string) => mutate((d) => removeById(d.entries, id)),

    listRecurring: () => read((d) => [...d.recurring].sort((a, b) => a.next_date.localeCompare(b.next_date))),

    getRecurring: (id: string) => read((d) => d.recurring.find((r) => r.id === id) ?? null),

    createRecurring: (input: NewRecurring) =>
      mutate((d, now) => {
        const row: FinanceRecurring = { id: randomUUID(), ...input, created_at: now, updated_at: now };
        d.recurring.push(row);
        return row;
      }),

    updateRecurring: (id: string, patch: RecurringPatch) =>
      mutate((d, now) => patchById(d.recurring, id, patch, { updated_at: now })),

    deleteRecurring: (id: string) =>
      mutate((d) => {
        const ok = removeById(d.recurring, id);
        if (ok) for (const e of d.entries) if (e.recurring_id === id) e.recurring_id = null;
        return ok;
      }),
  };
}
