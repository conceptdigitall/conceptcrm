// Contrato de armazenamento do módulo Financeiro. As rotas de API só falam com
// esta interface; trocar o arquivo local pelo Supabase não muda rota nem tela.

import type { FinanceCategory, FinanceEntry, FinanceRecurring } from './types';

export type NewCategory = Pick<FinanceCategory, 'name' | 'kind' | 'color'>;
export type CategoryPatch = Partial<Pick<FinanceCategory, 'name' | 'kind' | 'color' | 'archived'>>;

export type NewEntry = Omit<FinanceEntry, 'id' | 'created_at' | 'updated_at'>;
export type EntryPatch = Partial<NewEntry>;

export type NewRecurring = Omit<FinanceRecurring, 'id' | 'created_at' | 'updated_at'>;
export type RecurringPatch = Partial<NewRecurring>;

export interface EntryFilter {
  /** Inclusive, 'YYYY-MM-DD'. */
  from?: string;
  /** Inclusive, 'YYYY-MM-DD'. */
  to?: string;
}

export interface FinanceRepository {
  listCategories(): Promise<FinanceCategory[]>;
  createCategory(input: NewCategory): Promise<FinanceCategory>;
  updateCategory(id: string, patch: CategoryPatch): Promise<FinanceCategory | null>;
  /** Apaga e deixa os lançamentos/fixos dessa categoria como "sem categoria". */
  deleteCategory(id: string): Promise<boolean>;

  /** Ordenados do mais recente para o mais antigo. */
  listEntries(filter?: EntryFilter): Promise<FinanceEntry[]>;
  getEntry(id: string): Promise<FinanceEntry | null>;
  createEntry(input: NewEntry): Promise<FinanceEntry>;
  updateEntry(id: string, patch: EntryPatch): Promise<FinanceEntry | null>;
  deleteEntry(id: string): Promise<boolean>;

  listRecurring(): Promise<FinanceRecurring[]>;
  getRecurring(id: string): Promise<FinanceRecurring | null>;
  createRecurring(input: NewRecurring): Promise<FinanceRecurring>;
  updateRecurring(id: string, patch: RecurringPatch): Promise<FinanceRecurring | null>;
  deleteRecurring(id: string): Promise<boolean>;
}
