'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { BarChart } from '@/components/tremor/bar-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateBr, shortMonthLabel } from '@/lib/finance/dates';
import { BASE_CURRENCY, formatMoney, formatRate } from '@/lib/finance/money';
import type { CategoryTotal, FinanceSummary } from '@/lib/finance/summary';
import type { RateQuote } from '@/lib/finance/types';
import { cn } from '@/lib/utils';
import { financeApi } from './api';
import { CategoryDot } from './form-parts';
import { ProfitSplitCard } from './profit-split-card';

const TICKER = ['USD', 'EUR', 'GBP'];

function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

function Kpi({
  label,
  value,
  hint,
  tone,
  change,
  goodWhenUp = true,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'pos' | 'neg';
  change?: number | null;
  goodWhenUp?: boolean;
}) {
  const good = change != null && (goodWhenUp ? change >= 0 : change <= 0);
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={cn(
            'mt-1 text-xl font-semibold tabular-nums',
            tone === 'pos' && 'text-emerald-600 dark:text-emerald-400',
            tone === 'neg' && 'text-rose-600 dark:text-rose-400'
          )}
        >
          {value}
        </p>
        {change != null && (
          <p
            className={cn(
              'mt-0.5 text-xs tabular-nums',
              good
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            )}
          >
            {change >= 0 ? '+' : ''}
            {change}% vs. mês anterior
          </p>
        )}
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function CategoryBars({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: CategoryTotal[];
  empty: string;
}) {
  const total = rows.reduce((s, r) => s + r.total_cents, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.category_id ?? 'none'}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <CategoryDot color={r.color} />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(r.total_cents)}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {total ? Math.round((r.total_cents / total) * 100) : 0}%
                    </span>
                  </span>
                </div>
                <div className="bg-muted mt-1 h-2 rounded-full">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${total ? (r.total_cents / total) * 100 : 0}%`,
                      backgroundColor: r.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function Overview({
  month,
  refreshKey,
}: {
  month: string;
  refreshKey: number;
}) {
  // Resultado guardado com a chave da busca: trocar de mês mostra "carregando"
  // sem precisar zerar o estado dentro do effect.
  const requestKey = `${month}:${refreshKey}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    summary: FinanceSummary | null;
    failed: boolean;
  } | null>(null);
  const [rates, setRates] = useState<RateQuote[] | null>(null);
  const current = loaded?.key === requestKey ? loaded : null;
  const summary = current?.summary ?? null;
  const failed = current?.failed ?? false;

  useEffect(() => {
    let alive = true;
    const key = `${month}:${refreshKey}`;
    financeApi
      .summary(month)
      .then((s) => alive && setLoaded({ key, summary: s, failed: false }))
      .catch(() => alive && setLoaded({ key, summary: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [month, refreshKey]);

  useEffect(() => {
    let alive = true;
    financeApi
      .rates(TICKER)
      .then((r) => alive && setRates(r.rates))
      .catch(() => alive && setRates([]));
    return () => {
      alive = false;
    };
  }, []);

  if (failed)
    return (
      <p className="text-destructive text-sm">
        Não foi possível carregar o resumo.
      </p>
    );
  if (!summary)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );

  const s = summary;
  const foreignShare = s.expense_cents
    ? Math.round((s.foreign_expense_cents / s.expense_cents) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Entradas no mês"
          value={formatMoney(s.income_cents)}
          change={pctChange(s.income_cents, s.previous.income_cents)}
        />
        <Kpi
          label="Gastos no mês"
          value={formatMoney(s.expense_cents)}
          change={pctChange(s.expense_cents, s.previous.expense_cents)}
          goodWhenUp={false}
          hint={
            s.foreign_expense_cents
              ? `${foreignShare}% em moeda estrangeira`
              : undefined
          }
        />
        <Kpi
          label="Sobra para reinvestir"
          value={formatMoney(s.balance_cents)}
          tone={s.balance_cents < 0 ? 'neg' : 'pos'}
        />
        <Kpi
          label="Custo fixo mensal"
          value={formatMoney(s.recurring_monthly_expense_cents)}
          hint={
            s.recurring_monthly_income_cents
              ? `Entradas fixas: ${formatMoney(s.recurring_monthly_income_cents)}`
              : 'Assinaturas e fixos, cotação de hoje'
          }
        />
      </div>

      {s.missing_rates.length > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Sem cotação agora para {s.missing_rates.join(', ')}: esses fixos
          ficaram fora do custo fixo mensal.
        </p>
      )}

      <ProfitSplitCard
        balanceCents={s.balance_cents}
        incomeCents={s.income_cents}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Entradas x gastos (últimos 6 meses)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={s.series.map((p) => ({
              mes: shortMonthLabel(p.month),
              Entradas: p.income_cents / 100,
              Gastos: p.expense_cents / 100,
            }))}
            index="mes"
            categories={['Entradas', 'Gastos']}
            colors={['emerald', 'pink']}
            valueFormatter={(v) => formatMoney(Math.round(v * 100))}
            yAxisWidth={104}
            className="h-[240px]"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryBars
          title="Para onde foi o dinheiro"
          rows={s.expense_by_category}
          empty="Nenhum gasto lançado neste mês."
        />
        <CategoryBars
          title="De onde veio"
          rows={s.income_by_category}
          empty="Nenhuma entrada lançada neste mês."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Próximas cobranças (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {s.upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nada previsto.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {s.upcoming.map((u) => (
                  <li key={u.id} className="flex justify-between gap-3">
                    <span className="truncate">
                      <span className="text-muted-foreground tabular-nums">
                        {formatDateBr(u.next_date).slice(0, 5)}
                      </span>{' '}
                      · {u.description}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 tabular-nums',
                        u.kind === 'income' &&
                          'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {u.currency !== BASE_CURRENCY && (
                        <span className="text-muted-foreground mr-2 text-xs">
                          {formatMoney(u.monthly_cents, u.currency)}/mês
                        </span>
                      )}
                      {u.monthly_brl_cents != null
                        ? formatMoney(u.monthly_brl_cents)
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cotação de hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {!rates ? (
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            ) : rates.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Cotações indisponíveis no momento.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {rates.map((r) => (
                  <li key={r.currency} className="flex justify-between">
                    <span>1 {r.currency}</span>
                    <span className="tabular-nums">
                      R$ {formatRate(r.rate)}
                    </span>
                  </li>
                ))}
                <li className="text-muted-foreground pt-1 text-xs">
                  Fonte:{' '}
                  {rates[0].source === 'awesomeapi'
                    ? 'AwesomeAPI'
                    : 'BCE/Frankfurter'}{' '}
                  · {formatDateBr(rates[0].date)}
                </li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
