"use client";

// Painel Financeiro: visão geral, lançamentos, fixos e categorias.
// Não depende de login nem do menu do CRM; quem embala decide o acesso
// (página /financeiro dentro do painel, ou /local/financeiro no modo local).

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { longMonthLabel, monthOf, shiftMonth, todayInBrazil } from "@/lib/finance/dates";
import type { FinanceCategory } from "@/lib/finance/types";
import { cn } from "@/lib/utils";
import { financeApi } from "./api";
import { CategoriesPanel } from "./categories-panel";
import { EntriesList } from "./entries-list";
import { Overview } from "./overview";
import { ReceivablesPanel } from "./receivables-panel";
import { RecurringList } from "./recurring-list";

type Tab = "overview" | "entries" | "receivables" | "recurring" | "categories";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "entries", label: "Lançamentos" },
  { id: "receivables", label: "Cobranças e Simples" },
  { id: "recurring", label: "Assinaturas e fixos" },
  { id: "categories", label: "Categorias" },
];

export function FinanceDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState(() => monthOf(todayInBrazil()));
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    financeApi
      .categories()
      .then((c) => {
        if (!alive) return;
        setCategories(c);
        setLoadError(null);
      })
      .catch((err: Error) => alive && setLoadError(err.message));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const showMonth = tab === "overview" || tab === "entries" || tab === "receivables";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="mt-1 text-sm text-muted-foreground">O que entrou, o que saiu e quanto sobra para reinvestir.</p>
        </div>
        {showMonth && (
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft /></Button>
            <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase">{longMonthLabel(month)}</span>
            <Button size="icon-sm" variant="outline" aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight /></Button>
            {month !== monthOf(todayInBrazil()) && (
              <Button size="sm" variant="ghost" onClick={() => setMonth(monthOf(todayInBrazil()))}>Hoje</Button>
            )}
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Seções do financeiro" className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm",
              tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {tab === "overview" && <Overview month={month} refreshKey={refreshKey} />}
      {tab === "entries" && <EntriesList month={month} categories={categories} refreshKey={refreshKey} onChanged={refresh} />}
      {tab === "receivables" && <ReceivablesPanel month={month} categories={categories} refreshKey={refreshKey} onChanged={refresh} />}
      {tab === "recurring" && <RecurringList categories={categories} refreshKey={refreshKey} onChanged={refresh} />}
      {tab === "categories" && <CategoriesPanel categories={categories} onChanged={refresh} />}
    </div>
  );
}
