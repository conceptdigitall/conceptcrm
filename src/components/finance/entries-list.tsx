"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { entriesToCsv } from "@/lib/finance/csv";
import { formatDateBr } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { effectiveBrlCents, type FinanceCategory, type FinanceEntry, type FinanceKind } from "@/lib/finance/types";
import { cn } from "@/lib/utils";
import { financeApi } from "./api";
import { EntryDialog } from "./entry-dialog";
import { CategoryDot, MoneyStack, NativeSelect } from "./form-parts";

type KindFilter = "all" | FinanceKind;

export function EntriesList({
  month, categories, refreshKey, onChanged,
}: {
  month: string;
  categories: FinanceCategory[];
  refreshKey: number;
  onChanged: () => void;
}) {
  // Resultado guardado com a chave da busca: trocar de mês mostra "carregando"
  // sem precisar zerar o estado dentro do effect.
  const requestKey = `${month}:${refreshKey}`;
  const [loaded, setLoaded] = useState<{ key: string; entries: FinanceEntry[] | null; failed: boolean } | null>(null);
  const current = loaded?.key === requestKey ? loaded : null;
  const entries = current?.entries ?? null;
  const failed = current?.failed ?? false;
  const [kind, setKind] = useState<KindFilter>("all");
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<FinanceEntry | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    const key = `${month}:${refreshKey}`;
    financeApi
      .entries(month)
      .then((e) => alive && setLoaded({ key, entries: e, failed: false }))
      .catch(() => alive && setLoaded({ key, entries: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [month, refreshKey]);

  const cats = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const visible = (entries ?? []).filter(
    (e) =>
      (kind === "all" || e.kind === kind) &&
      (!categoryId || (categoryId === "none" ? !e.category_id : e.category_id === categoryId)) &&
      (!query || e.description.toLowerCase().includes(query.toLowerCase())),
  );
  const total = visible.reduce((s, e) => s + (e.kind === "income" ? 1 : -1) * effectiveBrlCents(e), 0);

  function exportCsv() {
    const blob = new Blob(["\ufeff" + entriesToCsv(visible, categories)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(e: FinanceEntry) {
    if (!window.confirm(`Apagar "${e.description}"? Isso não pode ser desfeito.`)) return;
    try {
      await financeApi.deleteEntry(e.id);
      toast.success("Lançamento apagado");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Buscar" placeholder="Buscar descrição…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-48" />
        <NativeSelect aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} className="w-36">
          <option value="all">Tudo</option>
          <option value="expense">Só gastos</option>
          <option value="income">Só entradas</option>
        </NativeSelect>
        <NativeSelect aria-label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-52">
          <option value="">Todas as categorias</option>
          <option value="none">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </NativeSelect>
        <Button className="ml-auto" variant="outline" onClick={exportCsv} disabled={visible.length === 0}>
          <Download /> Exportar CSV
        </Button>
        <Button onClick={() => setCreating(true)}>
          <Plus /> Novo lançamento
        </Button>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {failed && <p className="p-4 text-sm text-destructive">Não foi possível carregar os lançamentos.</p>}
          {!entries && !failed && (
            <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          )}
          {entries && visible.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {entries.length === 0 ? "Nenhum lançamento neste mês ainda." : "Nada encontrado com esses filtros."}
            </p>
          )}
          {entries && visible.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Data</th>
                    <th className="px-4 py-2 text-left font-normal">Descrição</th>
                    <th className="px-4 py-2 text-left font-normal">Categoria</th>
                    <th className="px-4 py-2 text-right font-normal">Valor</th>
                    <th className="w-20 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => {
                    const cat = e.category_id ? cats.get(e.category_id) : undefined;
                    return (
                      <tr key={e.id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{formatDateBr(e.date)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {e.recurring_id && <Repeat aria-label="Cobrança de fixo" className="size-3.5 text-muted-foreground" />}
                            <span className="font-medium">{e.description}</span>
                          </div>
                          {e.notes && <p className="max-w-xs truncate text-xs text-muted-foreground">{e.notes}</p>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <CategoryDot color={cat?.color ?? "#94a3b8"} />
                            {cat?.name ?? "Sem categoria"}
                          </span>
                        </td>
                        <td className={cn("px-4 py-2.5", e.kind === "income" ? "text-emerald-600 dark:text-emerald-400" : "")}>
                          <MoneyStack amountCents={e.amount_cents} currency={e.currency} brlCents={e.amount_brl_cents} actualBrlCents={e.actual_brl_cents} />
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex justify-end gap-0.5">
                            <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEditing(e)}><Pencil /></Button>
                            <Button size="icon-sm" variant="ghost" aria-label="Apagar" onClick={() => void remove(e)}><Trash2 /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border text-sm">
                    <td colSpan={3} className="px-4 py-2.5 text-muted-foreground">{visible.length} lançamento(s) · saldo dos filtrados</td>
                    <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", total < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                      {formatMoney(total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDialog
        open={creating || editing !== null}
        entry={editing}
        categories={categories}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={onChanged}
      />
    </div>
  );
}
