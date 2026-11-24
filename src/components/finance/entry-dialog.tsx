"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateBr, todayInBrazil } from "@/lib/finance/dates";
import { BASE_CURRENCY, formatMoney, formatRate, parseMoneyInput, toBrlCents } from "@/lib/finance/money";
import type { FinanceCategory, FinanceEntry, FinanceKind, RateQuote } from "@/lib/finance/types";
import { financeApi, type EntryForm } from "./api";
import { CategorySelect, CurrencySelect, Field, KindToggle } from "./form-parts";

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function initialForm(entry: FinanceEntry | null, kind: FinanceKind): EntryForm {
  if (!entry) {
    return { kind, description: "", category_id: null, amount: "", currency: BASE_CURRENCY, date: todayInBrazil(), manual_rate: null, actual_brl: null, notes: null };
  }
  return {
    kind: entry.kind,
    description: entry.description,
    category_id: entry.category_id,
    amount: centsToInput(entry.amount_cents),
    currency: entry.currency,
    date: entry.date,
    manual_rate: entry.rate_source === "manual" ? String(entry.rate_to_brl).replace(".", ",") : null,
    actual_brl: entry.actual_brl_cents != null ? centsToInput(entry.actual_brl_cents) : null,
    notes: entry.notes,
  };
}

export function EntryDialog({
  open, onClose, onSaved, categories, entry, defaultKind = "expense",
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: FinanceCategory[];
  entry: FinanceEntry | null;
  defaultKind?: FinanceKind;
}) {
  const [form, setForm] = useState<EntryForm>(() => initialForm(entry, defaultKind));
  const [quote, setQuote] = useState<RateQuote | null>(null);
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "failed">("idle");
  const [useManual, setUseManual] = useState(Boolean(form.manual_rate));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const f = initialForm(entry, defaultKind);
      setForm(f);
      setUseManual(Boolean(f.manual_rate));
    }
  }, [open, entry, defaultKind]);

  const foreign = form.currency !== BASE_CURRENCY;

  // Prévia da cotação; o valor gravado é sempre recalculado no servidor.
  useEffect(() => {
    if (!open || !foreign || !form.date) {
      setQuote(null);
      setQuoteState("idle");
      return;
    }
    let alive = true;
    setQuoteState("loading");
    const t = setTimeout(() => {
      financeApi
        .rates([form.currency], form.date)
        .then((r) => {
          if (!alive) return;
          setQuote(r.rates[0] ?? null);
          setQuoteState(r.rates[0] ? "idle" : "failed");
        })
        .catch(() => alive && setQuoteState("failed"));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, foreign, form.currency, form.date]);

  const set = <K extends keyof EntryForm>(k: K, v: EntryForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const amountCents = parseMoneyInput(form.amount);
  const manualRate = useManual && form.manual_rate ? Number(form.manual_rate.replace(",", ".")) : null;
  const rate = manualRate && manualRate > 0 ? manualRate : quote?.rate ?? null;
  const previewBrl = amountCents && rate ? toBrlCents(amountCents, rate) : null;

  async function save() {
    if (!form.description.trim()) return toast.error("Preencha a descrição");
    if (!amountCents) return toast.error("Preencha um valor maior que zero");
    if (foreign && !rate) return toast.error("Sem cotação disponível: informe a cotação manualmente");
    setSaving(true);
    const payload: EntryForm = {
      ...form,
      manual_rate: foreign && useManual && form.manual_rate ? form.manual_rate : null,
      actual_brl: foreign && form.actual_brl ? form.actual_brl : null,
    };
    try {
      if (entry) await financeApi.updateEntry(entry.id, payload);
      else await financeApi.createEntry(payload);
      toast.success(entry ? "Lançamento atualizado" : "Lançamento registrado");
      onSaved();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>Valores em outra moeda são convertidos para real pela cotação do dia do pagamento.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <KindToggle
            value={form.kind}
            onChange={(k) => setForm((f) => ({ ...f, kind: k, category_id: k === f.kind ? f.category_id : null }))}
          />

          <Field label="Descrição" htmlFor="fin-desc">
            <Input id="fin-desc" value={form.description} maxLength={120} placeholder="Ex.: ChatGPT Plus, Meta Ads, Venda site" onChange={(e) => set("description", e.target.value)} />
          </Field>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Valor" htmlFor="fin-amount">
              <Input id="fin-amount" inputMode="decimal" value={form.amount} placeholder="0,00" onChange={(e) => set("amount", e.target.value)} />
            </Field>
            <Field label="Moeda" htmlFor="fin-currency">
              <CurrencySelect id="fin-currency" value={form.currency} onChange={(c) => set("currency", c)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" htmlFor="fin-date">
              <Input id="fin-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="Categoria" htmlFor="fin-cat">
              <CategorySelect id="fin-cat" value={form.category_id} onChange={(v) => set("category_id", v)} categories={categories} kind={form.kind} />
            </Field>
          </div>

          {foreign && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Em reais</p>
                  <p className="text-lg font-semibold tabular-nums">{previewBrl != null ? formatMoney(previewBrl) : "—"}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {quoteState === "loading" && !useManual && <Loader2 className="ml-auto size-4 animate-spin" />}
                  {useManual && manualRate ? (
                    <p>Cotação manual: {formatRate(manualRate)}</p>
                  ) : quote ? (
                    <p>
                      1 {quote.currency} = R$ {formatRate(quote.rate)}
                      <br />
                      {formatDateBr(quote.date)} · {quote.source === "awesomeapi" ? "AwesomeAPI" : "BCE/Frankfurter"}
                    </p>
                  ) : quoteState === "failed" ? (
                    <p className="text-destructive">Cotação indisponível</p>
                  ) : null}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useManual} onChange={(e) => setUseManual(e.target.checked)} />
                Usar cotação manual
              </label>
              {useManual && (
                <Input aria-label="Cotação manual (reais por 1 unidade)" inputMode="decimal" placeholder="Ex.: 5,85" value={form.manual_rate ?? ""} onChange={(e) => set("manual_rate", e.target.value || null)} />
              )}

              <Field label="Valor real cobrado em reais (opcional)" htmlFor="fin-actual" hint="O que veio na fatura, com IOF e spread do cartão. Se preenchido, é este valor que entra nos totais.">
                <Input id="fin-actual" inputMode="decimal" placeholder="0,00" value={form.actual_brl ?? ""} onChange={(e) => set("actual_brl", e.target.value || null)} />
              </Field>
            </div>
          )}

          <Field label="Observação (opcional)" htmlFor="fin-notes">
            <Textarea id="fin-notes" rows={2} maxLength={500} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {entry ? "Salvar" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
