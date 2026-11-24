'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { addMonths, todayInBrazil } from '@/lib/finance/dates';
import {
  BASE_CURRENCY,
  formatMoney,
  parseMoneyInput,
} from '@/lib/finance/money';
import type { FinanceCategory, FinanceRecurring } from '@/lib/finance/types';
import { financeApi, type RecurringForm } from './api';
import {
  CategorySelect,
  CurrencySelect,
  Field,
  KindToggle,
  NativeSelect,
} from './form-parts';

/** "once" = pagamento único (só entradas, só ao criar): vira lançamento, não fixo. */
type Cycle = RecurringForm['cycle'] | 'once';
type Form = Omit<RecurringForm, 'cycle'> & { cycle: Cycle };

interface MonthlyExtra {
  enabled: boolean;
  amount: string;
  start: string;
}

function initialForm(r: FinanceRecurring | null): Form {
  if (!r) {
    return {
      kind: 'expense',
      description: '',
      category_id: null,
      amount: '',
      currency: BASE_CURRENCY,
      cycle: 'monthly',
      next_date: todayInBrazil(),
      notes: null,
    };
  }
  return {
    kind: r.kind,
    description: r.description,
    category_id: r.category_id,
    amount: (r.amount_cents / 100).toFixed(2).replace('.', ','),
    currency: r.currency,
    cycle: r.cycle,
    next_date: r.next_date,
    notes: r.notes,
  };
}

const emptyMonthly = (): MonthlyExtra => ({
  enabled: false,
  amount: '',
  start: addMonths(todayInBrazil(), 1),
});

export function RecurringDialog({
  open,
  onClose,
  onSaved,
  categories,
  recurring,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: FinanceCategory[];
  recurring: FinanceRecurring | null;
}) {
  const [form, setForm] = useState<Form>(() => initialForm(recurring));
  const [monthly, setMonthly] = useState<MonthlyExtra>(emptyMonthly);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm(recurring));
      setMonthly(emptyMonthly());
    }
  }, [open, recurring]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const once = form.cycle === 'once';
  const canBeOnce = form.kind === 'income' && !recurring;

  function changeDate(date: string) {
    // Sugere a mensal um mês depois do pagamento único, enquanto a pessoa não mexeu nela.
    setMonthly((m) =>
      once && !m.amount && date ? { ...m, start: addMonths(date, 1) } : m
    );
    set('next_date', date);
  }

  async function save() {
    if (!form.description.trim()) return toast.error('Preencha a descrição');
    if (once && monthly.enabled && !parseMoneyInput(monthly.amount))
      return toast.error('Preencha o valor da cobrança mensal');
    setSaving(true);
    try {
      if (once) {
        const res = await financeApi.createOneTime({
          ...form,
          kind: 'income',
          cycle: 'once',
          has_monthly: monthly.enabled,
          monthly_amount: monthly.enabled ? monthly.amount : null,
          monthly_start: monthly.enabled ? monthly.start : null,
        });
        toast.success(
          res.recurring
            ? 'Pagamento registrado e cobrança mensal cadastrada'
            : 'Pagamento único registrado'
        );
      } else {
        const data: RecurringForm = {
          ...form,
          cycle: form.cycle as RecurringForm['cycle'],
        };
        if (recurring) await financeApi.updateRecurring(recurring.id, data);
        else await financeApi.createRecurring(data);
        toast.success(recurring ? 'Fixo atualizado' : 'Fixo cadastrado');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const monthlyCents = parseMoneyInput(monthly.amount);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {recurring ? 'Editar fixo' : 'Nova assinatura ou fixo'}
          </DialogTitle>
          <DialogDescription>
            {once
              ? 'Pagamento único: entra como lançamento na data do pagamento. Se o cliente também paga por mês, marque a cobrança mensal.'
              : 'Cobranças que se repetem. Entram no custo fixo mensal pela cotação de hoje; quando cobrar, use “Registrar cobrança” para lançar com a cotação do dia.'}
          </DialogDescription>
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
            onChange={(k) =>
              setForm((f) => ({
                ...f,
                kind: k,
                category_id: k === f.kind ? f.category_id : null,
                // Gasto não tem "único": volta para mensal.
                cycle:
                  k === 'expense' && f.cycle === 'once' ? 'monthly' : f.cycle,
              }))
            }
          />
          <Field label="Descrição" htmlFor="rec-desc">
            <Input
              id="rec-desc"
              value={form.description}
              maxLength={120}
              placeholder={
                form.kind === 'income'
                  ? 'Ex.: Site cliente X, Consultoria'
                  : 'Ex.: ChatGPT Plus, Google Workspace'
              }
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field
              label={once ? 'Valor do pagamento' : 'Valor por cobrança'}
              htmlFor="rec-amount"
            >
              <Input
                id="rec-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            </Field>
            <Field label="Moeda" htmlFor="rec-currency">
              <CurrencySelect
                id="rec-currency"
                value={form.currency}
                onChange={(c) => set('currency', c)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ciclo" htmlFor="rec-cycle">
              <NativeSelect
                id="rec-cycle"
                value={form.cycle}
                onChange={(e) => set('cycle', e.target.value as Cycle)}
              >
                {canBeOnce && <option value="once">Único</option>}
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
              </NativeSelect>
            </Field>
            <Field
              label={once ? 'Data do pagamento' : 'Próxima cobrança'}
              htmlFor="rec-next"
            >
              <Input
                id="rec-next"
                type="date"
                value={form.next_date}
                onChange={(e) => changeDate(e.target.value)}
              />
            </Field>
          </div>

          {once && (
            <div className="border-border bg-muted/40 space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={monthly.enabled}
                  onChange={(e) =>
                    setMonthly((m) => ({ ...m, enabled: e.target.checked }))
                  }
                />
                Tem cobrança mensal?
              </label>
              {monthly.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label={`Valor mensal (${form.currency})`}
                      htmlFor="rec-monthly-amount"
                    >
                      <Input
                        id="rec-monthly-amount"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={monthly.amount}
                        onChange={(e) =>
                          setMonthly((m) => ({ ...m, amount: e.target.value }))
                        }
                      />
                    </Field>
                    <Field
                      label="Primeira cobrança"
                      htmlFor="rec-monthly-start"
                    >
                      <Input
                        id="rec-monthly-start"
                        type="date"
                        value={monthly.start}
                        onChange={(e) =>
                          setMonthly((m) => ({ ...m, start: e.target.value }))
                        }
                      />
                    </Field>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Vira um fixo mensal de entrada
                    {monthlyCents
                      ? ` de ${formatMoney(monthlyCents, form.currency)}`
                      : ''}{' '}
                    em &quot;Assinaturas e fixos&quot;. A cada mês, use
                    &quot;Registrar cobrança&quot; quando o cliente pagar.
                  </p>
                </>
              )}
            </div>
          )}

          <Field label="Categoria" htmlFor="rec-cat">
            <CategorySelect
              id="rec-cat"
              value={form.category_id}
              onChange={(v) => set('category_id', v)}
              categories={categories}
              kind={form.kind}
            />
          </Field>
          <Field label="Observação (opcional)" htmlFor="rec-notes">
            <Textarea
              id="rec-notes"
              rows={2}
              maxLength={500}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {recurring ? 'Salvar' : once ? 'Registrar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
