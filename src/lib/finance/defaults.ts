// Categorias iniciais. Criadas uma única vez quando a conta ainda não tem
// nenhuma; depois disso tudo é editável (renomear, mudar cor, arquivar).

import type { FinanceKind } from './types';

export const DEFAULT_CATEGORIES: { name: string; kind: FinanceKind; color: string }[] = [
  { name: 'Assinaturas', kind: 'expense', color: '#6366f1' },
  { name: 'Anúncios', kind: 'expense', color: '#f97316' },
  { name: 'Serviços de terceiros', kind: 'expense', color: '#14b8a6' },
  { name: 'Ferramentas e equipamentos', kind: 'expense', color: '#8b5cf6' },
  { name: 'Impostos e taxas', kind: 'expense', color: '#ef4444' },
  { name: 'Folha e pró-labore', kind: 'expense', color: '#ec4899' },
  { name: 'Outros gastos', kind: 'expense', color: '#64748b' },
  { name: 'Mensalidades de clientes', kind: 'income', color: '#3b82f6' },
  { name: 'Vendas', kind: 'income', color: '#22c55e' },
  { name: 'Serviços prestados', kind: 'income', color: '#0ea5e9' },
  { name: 'Outras entradas', kind: 'income', color: '#84cc16' },
];

/** Paleta oferecida ao criar categoria. */
export const CATEGORY_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#64748b',
];
