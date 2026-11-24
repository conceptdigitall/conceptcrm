"use client";

// Peças pequenas reaproveitadas pelos formulários e listas do Financeiro.

import { cn } from "@/lib/utils";
import { BASE_CURRENCY, FINANCE_CURRENCIES, formatMoney } from "@/lib/finance/money";
import type { FinanceCategory, FinanceKind } from "@/lib/finance/types";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function KindToggle({ value, onChange }: { value: FinanceKind; onChange: (k: FinanceKind) => void }) {
  return (
    <div role="group" aria-label="Tipo" className="inline-flex rounded-lg border border-border p-0.5">
      {([["expense", "Gasto"], ["income", "Entrada"]] as const).map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "rounded-md px-3 py-1 text-sm",
            value === k
              ? k === "expense" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function CurrencySelect({ id, value, onChange }: { id: string; value: string; onChange: (c: string) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>
      {FINANCE_CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>{c.code} · {c.label}</option>
      ))}
    </select>
  );
}

export function CategorySelect({
  id, value, onChange, categories, kind,
}: {
  id: string;
  value: string | null;
  onChange: (id: string | null) => void;
  categories: FinanceCategory[];
  kind: FinanceKind;
}) {
  const options = categories.filter((c) => c.kind === kind && (!c.archived || c.id === value));
  return (
    <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={SELECT_CLASS}>
      <option value="">Sem categoria</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>{c.name}{c.archived ? " (arquivada)" : ""}</option>
      ))}
    </select>
  );
}

export function NativeSelect(props: React.ComponentProps<"select">) {
  return <select {...props} className={cn(SELECT_CLASS, props.className)} />;
}

export function CategoryDot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

/** Valor original e, se for moeda estrangeira, o equivalente em reais logo abaixo. */
export function MoneyStack({
  amountCents, currency, brlCents, actualBrlCents, align = "right",
}: {
  amountCents: number;
  currency: string;
  brlCents: number;
  actualBrlCents?: number | null;
  align?: "left" | "right";
}) {
  const foreign = currency !== BASE_CURRENCY;
  return (
    <div className={cn("tabular-nums", align === "right" ? "text-right" : "text-left")}>
      <div className="font-medium">{formatMoney(foreign ? amountCents : (actualBrlCents ?? brlCents), currency)}</div>
      {foreign && (
        <div className="text-xs text-muted-foreground">
          {actualBrlCents != null ? (
            <>
              {formatMoney(actualBrlCents)} <span title={`Estimativa pela cotação: ${formatMoney(brlCents)}`}>(fatura)</span>
            </>
          ) : (
            <>≈ {formatMoney(brlCents)}</>
          )}
        </div>
      )}
    </div>
  );
}
