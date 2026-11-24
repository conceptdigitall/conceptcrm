"use client";

// Aba "Cobranças e Simples": mensalidades geradas dos contratos recorrentes
// (pagar, reabrir, cancelar) e o painel do Simples Nacional para o contador.

import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateBr, todayInBrazil } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import type { FinanceReceivable } from "@/lib/finance/receivables";
import type { FinanceCategory } from "@/lib/finance/types";
import { cn } from "@/lib/utils";
import { financeApi, type SimplesPanel } from "./api";
import { Field, NativeSelect } from "./form-parts";

const STATUS_LABEL: Record<FinanceReceivable["status"], string> = {
  pendente: "Pendente",
  pago: "Paga",
  cancelado: "Cancelada",
};

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "neg" }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "neg" && "text-rose-600 dark:text-rose-400")}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ReceivablesPanel({
  month, categories, refreshKey, onChanged,
}: {
  month: string;
  categories: FinanceCategory[];
  refreshKey: number;
  onChanged: () => void;
}) {
  const requestKey = `${month}:${refreshKey}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    receivables: FinanceReceivable[] | null;
    simples: SimplesPanel | null;
    error: string | null;
  } | null>(null);
  const current = loaded?.key === requestKey ? loaded : null;
  const [busy, setBusy] = useState(false);
  const [aliquota, setAliquota] = useState<string | null>(null);
  const [payrollId, setPayrollId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const key = `${month}:${refreshKey}`;
    Promise.all([financeApi.receivables(month), financeApi.simples(month)])
      .then(([r, s]) => alive && setLoaded({ key, receivables: r.receivables, simples: s, error: null }))
      .catch((err: Error) => alive && setLoaded({ key, receivables: null, simples: null, error: err.message }));
    return () => {
      alive = false;
    };
  }, [month, refreshKey]);

  /** Executa a ação; se ela devolver texto, ele substitui a mensagem de sucesso. */
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      const msg = await fn();
      toast.success(typeof msg === "string" ? msg : ok);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (current?.error) return <p className="text-sm text-destructive">{current.error}</p>;
  if (!current) {
    return <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const receivables = current.receivables ?? [];
  const simples = current.simples as SimplesPanel;
  const today = todayInBrazil();
  const active = receivables.filter((r) => r.status !== "cancelado");
  const received = active.filter((r) => r.status === "pago").reduce((s, r) => s + r.amount_cents, 0);
  const pending = active.filter((r) => r.status === "pendente");
  const pendingCents = pending.reduce((s, r) => s + r.amount_cents, 0);
  const overdueCents = pending.filter((r) => r.due_date < today).reduce((s, r) => s + r.amount_cents, 0);

  const aliquotaValue = aliquota ?? (simples.settings.simples_aliquota_percent != null ? String(simples.settings.simples_aliquota_percent).replace(".", ",") : "");
  const payrollValue = payrollId ?? simples.settings.payroll_category_id ?? "";
  const expenseCats = categories.filter((c) => c.kind === "expense" && !c.archived);
  const fr = simples.fator_r;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receita recorrente (MRR)" value={formatMoney(simples.mrr_cents)} hint="contratos recorrentes assinados" />
        <Stat label="Recebido no mês" value={formatMoney(received)} hint="cobranças de contrato pagas" />
        <Stat label="A receber" value={formatMoney(pendingCents)} hint={`${pending.length} cobrança(s) pendente(s)`} />
        <Stat label="Atrasado" value={formatMoney(overdueCents)} hint="pendentes com vencimento passado" tone={overdueCents > 0 ? "neg" : undefined} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Cobranças dos contratos</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const n = await financeApi.generateReceivables(month);
                return n === 0 ? "Nenhuma cobrança nova neste mês" : `${n} cobrança(s) gerada(s) dos contratos`;
              }, "Cobranças geradas")
            }
          >
            <Wand2 /> Gerar cobranças do mês
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          {receivables.length === 0 ? (
            <p className="px-6 pb-2 text-sm text-muted-foreground">
              Nenhuma cobrança neste mês. Use &quot;Gerar cobranças do mês&quot; para criar uma por contrato recorrente assinado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Vencimento</th>
                    <th className="px-4 py-2 text-left font-normal">Cliente</th>
                    <th className="px-4 py-2 text-left font-normal">Descrição</th>
                    <th className="px-4 py-2 text-right font-normal">Valor</th>
                    <th className="px-4 py-2 text-left font-normal">Situação</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((r) => {
                    const late = r.status === "pendente" && r.due_date < today;
                    return (
                      <tr key={r.id} className={cn("border-b border-border last:border-0", r.status === "cancelado" && "opacity-50")}>
                        <td className="px-4 py-2 tabular-nums">{formatDateBr(r.due_date)}</td>
                        <td className="px-4 py-2">{r.contact?.company || r.contact?.name || "—"}</td>
                        <td className="px-4 py-2">{r.description}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.amount_cents)}</td>
                        <td className={cn("px-4 py-2 text-xs", late && "text-rose-600 dark:text-rose-400")}>
                          {late ? "Atrasada" : STATUS_LABEL[r.status]}
                          {r.paid_date && ` em ${formatDateBr(r.paid_date)}`}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            {r.status === "pendente" && (
                              <>
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => financeApi.receivableAction(r.id, "pay"), "Cobrança paga e lançada como entrada")}>
                                  <Check /> Recebi
                                </Button>
                                <Button size="icon-sm" variant="ghost" aria-label="Cancelar cobrança" disabled={busy} onClick={() => run(() => financeApi.receivableAction(r.id, "cancel"), "Cobrança cancelada")}>
                                  <X />
                                </Button>
                              </>
                            )}
                            {r.status !== "pendente" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  if (r.status === "pago" && !window.confirm("Reabrir apaga o lançamento de entrada criado no pagamento. Continuar?")) return;
                                  run(() => financeApi.receivableAction(r.id, "reopen"), "Cobrança reaberta");
                                }}
                              >
                                <RotateCcw /> Reabrir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simples Nacional (referência para o contador)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Regime de caixa, a partir dos lançamentos. Não é cálculo oficial de imposto: a alíquota efetiva vem do contador.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Receita 12 meses (RBT12)" value={formatMoney(simples.rbt12_cents)} hint="entradas antes do mês escolhido" />
            <Stat label="Folha 12 meses" value={formatMoney(simples.payroll12_cents)} hint={simples.settings.payroll_category_id ? "categoria de folha" : "escolha a categoria de folha"} />
            <Stat
              label="Fator R"
              value={fr.ratio == null ? "—" : `${(fr.ratio * 100).toFixed(1).replace(".", ",")}%`}
              hint={fr.anexo ? `Anexo ${fr.anexo} (limite 28%)` : "sem receita nos 12 meses"}
            />
            <Stat
              label="Imposto estimado no mês"
              value={simples.estimated_tax_cents == null ? "—" : formatMoney(simples.estimated_tax_cents)}
              hint={`sobre ${formatMoney(simples.month_income_cents)} de entradas`}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Alíquota efetiva (%)" htmlFor="fin-aliquota">
              <Input id="fin-aliquota" className="w-40" inputMode="decimal" placeholder="ex.: 6,5" value={aliquotaValue} onChange={(e) => setAliquota(e.target.value)} />
            </Field>
            <Field label="Categoria da folha (Fator R)" htmlFor="fin-payroll">
              <NativeSelect id="fin-payroll" className="w-60" value={payrollValue} onChange={(e) => setPayrollId(e.target.value)}>
                <option value="">Nenhuma</option>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await financeApi.saveSimplesSettings({ aliquota: aliquotaValue.trim() || null, payroll_category_id: payrollValue || null });
                  setAliquota(null);
                  setPayrollId(null);
                }, "Configuração salva")
              }
            >
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
