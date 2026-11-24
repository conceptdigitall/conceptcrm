"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateBr, todayInBrazil } from "@/lib/finance/dates";
import { BASE_CURRENCY, formatMoney } from "@/lib/finance/money";
import type { FinanceCategory, FinanceRecurring } from "@/lib/finance/types";
import { cn } from "@/lib/utils";
import { financeApi } from "./api";
import { CategoryDot } from "./form-parts";
import { RecurringDialog } from "./recurring-dialog";

const CYCLE_LABEL = { monthly: "mensal", yearly: "anual" } as const;

export function RecurringList({
  categories, refreshKey, onChanged,
}: {
  categories: FinanceCategory[];
  refreshKey: number;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<FinanceRecurring[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<FinanceRecurring | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    financeApi
      .recurring()
      .then((r) => {
        if (!alive) return;
        setItems(r);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const cats = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const today = todayInBrazil();

  async function run(id: string, action: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try {
      await action();
      toast.success(ok);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function charge(r: FinanceRecurring) {
    let actual: string | null = null;
    if (r.currency !== BASE_CURRENCY) {
      const answer = window.prompt(
        `Valor real cobrado em reais na fatura (opcional).\nDeixe vazio para usar a cotação do dia.`,
        "",
      );
      if (answer === null) return;
      actual = answer.trim() || null;
    }
    void run(r.id, () => financeApi.chargeRecurring(r.id, { actual_brl: actual }), `Cobrança de "${r.description}" lançada`);
  }

  function remove(r: FinanceRecurring) {
    if (!window.confirm(`Apagar o fixo "${r.description}"? Os lançamentos já registrados continuam.`)) return;
    void run(r.id, () => financeApi.deleteRecurring(r.id), "Fixo apagado");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Assinaturas, mensalidades e entradas que se repetem.</p>
        <Button onClick={() => setCreating(true)}><Plus /> Novo fixo</Button>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {failed && <p className="p-4 text-sm text-destructive">Não foi possível carregar os fixos.</p>}
          {!items && !failed && <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
          {items && items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma assinatura ou custo fixo cadastrado.</p>
          )}
          {items && items.length > 0 && (
            <ul className="divide-y divide-border">
              {items.map((r) => {
                const cat = r.category_id ? cats.get(r.category_id) : undefined;
                const due = r.active && r.next_date <= today;
                return (
                  <li key={r.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !r.active && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.description}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-xs", r.kind === "income" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                          {r.kind === "income" ? "entrada" : "gasto"} {CYCLE_LABEL[r.cycle]}
                        </span>
                        {!r.active && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">pausado</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CategoryDot color={cat?.color ?? "#94a3b8"} />
                        {cat?.name ?? "Sem categoria"} ·{" "}
                        <span className={cn(due && "font-medium text-amber-600 dark:text-amber-400")}>
                          {due ? "vencida/hoje: " : "próxima: "}
                          {formatDateBr(r.next_date)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right font-medium tabular-nums">{formatMoney(r.amount_cents, r.currency)}</div>
                    <div className="flex gap-0.5">
                      {r.active && (
                        <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => charge(r)}>
                          <CheckCircle2 /> Registrar cobrança
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={r.active ? "Pausar" : "Retomar"}
                        disabled={busy === r.id}
                        onClick={() => void run(r.id, () => financeApi.updateRecurring(r.id, { active: !r.active }), r.active ? "Fixo pausado" : "Fixo retomado")}
                      >
                        {r.active ? <Pause /> : <Play />}
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEditing(r)}><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Apagar" disabled={busy === r.id} onClick={() => remove(r)}><Trash2 /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <RecurringDialog
        open={creating || editing !== null}
        recurring={editing}
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
