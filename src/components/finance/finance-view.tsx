'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, Loader2, Plus, RotateCcw, Trash2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fetchAllAccountContracts } from '@/lib/contracts/api';
import type { ContractWithContact } from '@/types/contracts';
import {
  EXPENSE_CATEGORIES,
  REVENUE_CATEGORIES,
  type FinanceEntry,
  type FinanceKind,
} from '@/types/finance';
import {
  addMonths,
  fatorR,
  formatBRL,
  isOverdue,
  monthKey,
  monthlySeries,
  mrrCents,
  payroll12Cents,
  rbt12Cents,
  summarizeMonth,
  toCsv,
} from '@/lib/finance/calc';
import {
  cancelEntry,
  createEntry,
  deleteEntry,
  fetchEntries,
  fetchSettings,
  generateReceivables,
  markPaid,
  reopenEntry,
  saveAliquota,
} from '@/lib/finance/api';

const todayStr = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD, fuso local
const monthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Card({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === 'bad' ? 'text-red-500' : tone === 'good' ? 'text-emerald-500' : ''}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function FinanceView() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();
  const today = todayStr();
  const currentMonth = monthKey(today);

  const [month, setMonth] = useState(currentMonth);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [contracts, setContracts] = useState<ContractWithContact[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string | null; company: string | null }[]>([]);
  const [aliquota, setAliquota] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    kind: 'receita' as FinanceKind,
    category: 'projeto',
    description: '',
    amount: '',
    due_date: today,
    contact_id: '',
    paid: false,
  });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [e, c, s, ct] = await Promise.all([
        fetchEntries(supabase, accountId, `${addMonths(currentMonth, -24)}-01`),
        fetchAllAccountContracts(supabase, accountId),
        fetchSettings(supabase, accountId),
        supabase.from('contacts').select('id, name, company').eq('account_id', accountId).order('name').limit(500),
      ]);
      setEntries(e);
      setContracts(c);
      setContacts((ct.data ?? []) as { id: string; name: string | null; company: string | null }[]);
      setAliquota(s?.simples_aliquota_percent != null ? String(s.simples_aliquota_percent).replace('.', ',') : '');
    } catch {
      toast.error('Erro ao carregar o financeiro');
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase, currentMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch {
      toast.error('Não foi possível concluir a ação');
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => summarizeMonth(entries, month, today), [entries, month, today]);
  const series = useMemo(() => monthlySeries(entries, currentMonth, 12), [entries, currentMonth]);
  const maxSeries = Math.max(1, ...series.flatMap((p) => [p.revenueCents, p.expenseCents]));
  const mrr = useMemo(() => mrrCents(contracts), [contracts]);
  const monthEntries = useMemo(
    () => entries.filter((e) => monthKey(e.due_date) === month).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [entries, month],
  );

  const rbt12 = rbt12Cents(entries, month);
  const payroll = payroll12Cents(entries, month);
  const fr = fatorR(payroll, rbt12);
  const aliquotaNum = aliquota.trim() === '' ? null : Number(aliquota.replace(',', '.'));
  const aliquotaValida = aliquotaNum !== null && Number.isFinite(aliquotaNum) && aliquotaNum >= 0 && aliquotaNum <= 100;
  const impostoEstimado = aliquotaValida ? Math.round((summary.receivedCents * (aliquotaNum as number)) / 100) : null;

  const submit = async () => {
    if (!accountId) return;
    const cents = Math.round(Number(form.amount.replace(/\./g, '').replace(',', '.')) * 100);
    if (!form.description.trim() || !Number.isFinite(cents) || cents <= 0) {
      toast.error('Preencha descrição e um valor maior que zero');
      return;
    }
    await act(
      () =>
        createEntry(supabase, {
          accountId,
          userId: user?.id,
          form: {
            kind: form.kind,
            category: form.category,
            description: form.description.trim(),
            amount_cents: cents,
            due_date: form.due_date,
            contact_id: form.contact_id || null,
            paid: form.paid,
          },
        }),
      'Lançamento criado',
    );
    setForm((f) => ({ ...f, description: '', amount: '', paid: false }));
    setShowForm(false);
  };

  const exportCsv = () => {
    const blob = new Blob(['﻿' + toCsv(monthEntries)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `financeiro-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading && entries.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const categories = form.kind === 'receita' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month"
          value={month}
          min={addMonths(currentMonth, -12)}
          max={addMonths(currentMonth, 3)}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="w-44"
          aria-label="Mês"
        />
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> Novo lançamento
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !accountId}
          onClick={() =>
            accountId &&
            act(async () => {
              const n = await generateReceivables(supabase, accountId, month);
              toast.message(n > 0 ? `${n} cobrança(s) gerada(s) dos contratos` : 'Nenhuma cobrança nova neste mês');
            })
          }
        >
          <Wand2 className="mr-1 h-4 w-4" /> Gerar cobranças dos contratos
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={monthEntries.length === 0}>
          <Download className="mr-1 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {showForm && (
        <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-6">
          <select
            className={selectClass}
            value={form.kind}
            aria-label="Tipo"
            onChange={(e) => {
              const kind = e.target.value as FinanceKind;
              setForm({ ...form, kind, category: kind === 'receita' ? 'projeto' : 'ferramentas' });
            }}
          >
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
          </select>
          <select className={selectClass} value={form.category} aria-label="Categoria" onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Input className="sm:col-span-2" placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input placeholder="Valor (R$)" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} aria-label="Vencimento" />
          <select className={`${selectClass} sm:col-span-3`} value={form.contact_id} aria-label="Cliente" onChange={(e) => setForm({ ...form, contact_id: e.target.value })}>
            <option value="">Sem cliente</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.company || c.name || 'Sem nome'}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />
            Já está pago
          </label>
          <Button disabled={busy} onClick={submit}>Salvar</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="Recebido no mês" value={formatBRL(summary.receivedCents)} tone="good" />
        <Card
          label="A receber"
          value={formatBRL(summary.receivableCents)}
          hint={summary.overdueCents > 0 ? `${formatBRL(summary.overdueCents)} em atraso` : undefined}
          tone={summary.overdueCents > 0 ? 'bad' : undefined}
        />
        <Card label="Despesas pagas" value={formatBRL(summary.expensesPaidCents)} hint={`${formatBRL(summary.expensesPendingCents)} a pagar`} />
        <Card label="Resultado (recebido − pago)" value={formatBRL(summary.profitCents)} tone={summary.profitCents < 0 ? 'bad' : 'good'} />
        <Card label="Receita recorrente (MRR)" value={formatBRL(mrr)} hint="contratos recorrentes assinados" />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Últimos 12 meses (pago)</p>
        <div className="flex h-36 items-end gap-2">
          {series.map((p) => (
            <div key={p.month} className="flex flex-1 flex-col items-center gap-1" title={`${p.month}: ${formatBRL(p.revenueCents)} recebido, ${formatBRL(p.expenseCents)} pago`}>
              <div className="flex h-28 w-full items-end justify-center gap-0.5">
                <div className="w-1/2 rounded-t bg-emerald-500/80" style={{ height: `${(p.revenueCents / maxSeries) * 100}%` }} />
                <div className="w-1/2 rounded-t bg-red-400/80" style={{ height: `${(p.expenseCents / maxSeries) * 100}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{monthLabel(p.month)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Verde: recebido · Vermelho: despesas pagas</p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">Lançamentos de {monthLabel(month)}</div>
        {monthEntries.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum lançamento neste mês.</p>
        ) : (
          <div className="divide-y">
            {monthEntries.map((e) => {
              const late = isOverdue(e, today);
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{e.due_date.split('-').reverse().slice(0, 2).join('/')}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{e.description}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {e.category}
                      {e.contact ? ` · ${e.contact.company || e.contact.name}` : ''}
                      {e.source === 'contrato' ? ' · contrato' : ''}
                    </p>
                  </div>
                  <Badge variant={e.status === 'pago' ? 'default' : 'outline'}>
                    {e.status === 'pago' ? 'Pago' : e.status === 'cancelado' ? 'Cancelado' : late ? 'Atrasado' : 'Pendente'}
                  </Badge>
                  <span className={`w-28 text-right font-medium ${e.kind === 'despesa' ? 'text-red-500' : ''} ${e.status === 'cancelado' ? 'line-through opacity-50' : ''}`}>
                    {e.kind === 'despesa' ? '−' : ''}{formatBRL(e.amount_cents)}
                  </span>
                  <div className="flex gap-1">
                    {e.status === 'pendente' && (
                      <Button size="icon" variant="ghost" title="Marcar como pago" disabled={busy} onClick={() => act(() => markPaid(supabase, e.id))}>
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    {e.status !== 'pendente' && (
                      <Button size="icon" variant="ghost" title="Reabrir" disabled={busy} onClick={() => act(() => reopenEntry(supabase, e.id))}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    {e.status === 'pendente' && (
                      <Button size="icon" variant="ghost" title="Cancelar" disabled={busy} onClick={() => act(() => cancelEntry(supabase, e.id))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Excluir"
                      disabled={busy}
                      onClick={() => window.confirm('Excluir este lançamento? Não dá para desfazer.') && act(() => deleteEntry(supabase, e.id), 'Lançamento excluído')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Simples Nacional (referência para o contador)</p>
          <p className="text-[11px] text-muted-foreground">
            Estimativa feita com os lançamentos pagos. Não substitui o PGDAS-D: a alíquota efetiva é a que o contador informar.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Card label="Receita 12 meses (RBT12)" value={formatBRL(rbt12)} hint="receitas pagas antes do mês escolhido" />
          <Card label="Folha 12 meses" value={formatBRL(payroll)} hint="despesas pagas na categoria folha" />
          <Card
            label="Fator R"
            value={fr.ratio === null ? '—' : `${(fr.ratio * 100).toFixed(1).replace('.', ',')}%`}
            hint={fr.anexo ? (fr.anexo === 'III' ? 'Anexo III (28% ou mais)' : 'Anexo V (abaixo de 28%)') : 'sem receita no período'}
            tone={fr.anexo === 'V' ? 'bad' : undefined}
          />
          <Card
            label="Imposto estimado do mês"
            value={impostoEstimado === null ? '—' : formatBRL(impostoEstimado)}
            hint="recebido no mês × alíquota informada"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-40" placeholder="Alíquota efetiva %" inputMode="decimal" value={aliquota} onChange={(e) => setAliquota(e.target.value)} aria-label="Alíquota efetiva em porcentagem" />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !accountId || (aliquota.trim() !== '' && !aliquotaValida)}
            onClick={() => accountId && act(() => saveAliquota(supabase, accountId, aliquotaNum), 'Alíquota salva')}
          >
            Salvar alíquota
          </Button>
        </div>
      </div>
    </div>
  );
}
