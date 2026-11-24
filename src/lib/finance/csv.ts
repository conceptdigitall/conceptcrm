// Exportação dos lançamentos para o contador: separador ";" e vírgula decimal (pt-BR).

import { effectiveBrlCents, type FinanceCategory, type FinanceEntry } from './types';

function csvText(value: string): string {
  // Evita injeção de fórmula ao abrir no Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;,"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const decimal = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

export function entriesToCsv(entries: FinanceEntry[], categories: FinanceCategory[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const rows = entries.map((e) =>
    [
      e.date,
      e.kind === 'income' ? 'entrada' : 'gasto',
      csvText(e.category_id ? (names.get(e.category_id) ?? '') : 'Sem categoria'),
      csvText(e.description),
      e.currency,
      decimal(e.amount_cents),
      String(e.rate_to_brl).replace('.', ','),
      decimal(effectiveBrlCents(e)),
    ].join(';'),
  );
  return ['data;tipo;categoria;descricao;moeda;valor_original;cotacao;valor_brl', ...rows].join('\n');
}
