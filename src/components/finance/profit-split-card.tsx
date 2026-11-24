'use client';

// Retirada de lucros: escolhe uma % da sobra (ou das entradas) do mês e mostra
// o total a retirar e quanto cabe a cada sócio. É uma simulação: nada é gravado
// no financeiro; a escolha (%, base, pessoas) fica lembrada neste navegador.

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/finance/money';
import {
  clampPeople,
  clampPercent,
  splitProfit,
  type ProfitBase,
} from '@/lib/finance/profit-split';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'finance.profitSplit';
const QUICK = [10, 20, 25, 30, 50];

interface Settings {
  base: ProfitBase;
  percent: number;
  people: number;
}

const DEFAULTS: Settings = { base: 'balance', percent: 25, people: 3 };

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? 'null'
    ) as Partial<Settings> | null;
    if (!raw) return DEFAULTS;
    return {
      base: raw.base === 'income' ? 'income' : 'balance',
      percent: clampPercent(Number(raw.percent ?? DEFAULTS.percent)),
      people: clampPeople(Number(raw.people ?? DEFAULTS.people)),
    };
  } catch {
    return DEFAULTS;
  }
}

export function ProfitSplitCard({
  balanceCents,
  incomeCents,
}: {
  balanceCents: number;
  incomeCents: number;
}) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [percentText, setPercentText] = useState(() =>
    String(settings.percent).replace('.', ',')
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Navegador sem localStorage (modo privado restrito): só não lembra a escolha.
    }
  }, [settings]);

  const setPercent = (p: number) => {
    const v = clampPercent(p);
    setSettings((s) => ({ ...s, percent: v }));
    setPercentText(String(v).replace('.', ','));
  };

  const split = splitProfit({ balanceCents, incomeCents, ...settings });
  const noProfit = settings.base === 'balance' && balanceCents <= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Retirada de lucros</CardTitle>
        <p className="text-muted-foreground text-sm">
          Quanto tirar para o bolso dos sócios neste mês. É só uma simulação,
          nada é lançado.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <span className="text-muted-foreground text-xs">
              Calcular sobre
            </span>
            <div
              role="group"
              aria-label="Base do cálculo"
              className="border-border flex rounded-lg border p-0.5"
            >
              {(
                [
                  ['balance', 'Sobra do mês'],
                  ['income', 'Entradas do mês'],
                ] as const
              ).map(([b, label]) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={settings.base === b}
                  onClick={() => setSettings((s) => ({ ...s, base: b }))}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm',
                    settings.base === b
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profit-percent"
              className="text-muted-foreground text-xs"
            >
              Porcentagem
            </label>
            <div className="flex items-center gap-1">
              <Input
                id="profit-percent"
                inputMode="decimal"
                className="w-20 text-right tabular-nums"
                value={percentText}
                onChange={(e) => {
                  setPercentText(e.target.value);
                  const n = Number(e.target.value.replace(',', '.'));
                  if (e.target.value.trim() !== '' && Number.isFinite(n))
                    setSettings((s) => ({ ...s, percent: clampPercent(n) }));
                }}
                onBlur={() =>
                  setPercentText(String(settings.percent).replace('.', ','))
                }
              />
              <span className="text-sm">%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profit-people"
              className="text-muted-foreground text-xs"
            >
              Dividir entre
            </label>
            <div className="flex items-center gap-1">
              <Input
                id="profit-people"
                type="number"
                min={1}
                max={20}
                className="w-16 text-right tabular-nums"
                value={settings.people}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    people: clampPeople(Number(e.target.value)),
                  }))
                }
              />
              <span className="text-sm">pessoas</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            aria-label="Porcentagem da retirada"
            value={Math.round(settings.percent)}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="accent-primary w-full"
          />
          <div className="flex flex-wrap gap-1">
            {QUICK.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPercent(p)}
                className={cn(
                  'border-border rounded-md border px-2 py-0.5 text-xs tabular-nums',
                  settings.percent === p
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        {noProfit ? (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
            Sem sobra neste mês ({formatMoney(balanceCents)}): não há lucro para
            retirar.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Total a retirar</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatMoney(split.totalCents)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {split.percent.toLocaleString('pt-BR')}% de{' '}
                  {formatMoney(split.baseCents)}
                </p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3">
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Users className="size-3.5" /> Para cada um ({split.people})
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatMoney(split.shares[0] ?? 0)}
                </p>
                {split.shares.some((v) => v !== split.shares[0]) && (
                  <p className="text-muted-foreground text-xs">
                    por causa dos centavos, alguns ficam com{' '}
                    {formatMoney(split.shares[split.shares.length - 1])}
                  </p>
                )}
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">
                  Fica na empresa para reinvestir
                </p>
                <p
                  className={cn(
                    'mt-1 text-xl font-semibold tabular-nums',
                    split.remainingBalanceCents < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {formatMoney(split.remainingBalanceCents)}
                </p>
                <p className="text-muted-foreground text-xs">
                  sobra do mês menos a retirada
                </p>
              </div>
            </div>
            {split.exceedsBalance && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Essa retirada é maior que a sobra do mês (
                {formatMoney(balanceCents)}): sairia dinheiro do caixa que já
                existia.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
