"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { isStoreAccount } from "@/lib/store-accounts";
import { lowConversion, percentChange, type AnalyticsDays, type ProductStat, type StoreAnalytics } from "@/lib/store/analytics";
import { BarChart } from "@/components/tremor/bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usd } from "./order-labels";

type Payload = { days: AnalyticsDays; current: StoreAnalytics; previous: StoreAnalytics };
type RankTab = "views" | "spins" | "adds" | "sold_qty" | "low";

const RANK_TABS: { id: RankTab; label: string }[] = [
  { id: "views", label: "Mais vistas" },
  { id: "spins", label: "Mais giradas" },
  { id: "adds", label: "Mais no carrinho" },
  { id: "sold_qty", label: "Mais vendidas" },
  { id: "low", label: "Muito vista, pouco vendida" },
];

const SOURCE_LABEL: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", google: "Google", tiktok: "TikTok", direct: "Direto", other: "Outros sites",
};
const DEVICE_LABEL: Record<string, string> = { mobile: "Celular", tablet: "Tablet", desktop: "Computador" };

async function fetchAnalytics(days: AnalyticsDays): Promise<Payload | null> {
  const res = await fetch(`/api/loja/analytics?days=${days}`);
  return res.ok ? res.json() : null;
}

const duration = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`);
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

export function StoreAnalyticsView() {
  const { account } = useAuth();
  const [days, setDays] = useState<AnalyticsDays>(30);
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<RankTab>("views");

  useEffect(() => {
    let alive = true;
    fetchAnalytics(days).then((d) => {
      if (!alive) return;
      setData(d);
      setFailed(!d);
    });
    return () => {
      alive = false;
    };
  }, [days]);

  const products = data?.current.products ?? [];
  const ranking: ProductStat[] =
    tab === "low"
      ? lowConversion(products)
      : [...products].sort((a, b) => b[tab] - a[tab]).filter((p) => p[tab] > 0);

  if (account && !isStoreAccount(account.id)) {
    return <p className="text-sm text-muted-foreground">Esta conta não tem o módulo Loja.</p>;
  }

  const c = data?.current;
  const p = data?.previous;
  const loading = !data && !failed;
  const current = data && data.days === days;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Loja</h1>
          <p className="mt-1 text-sm text-muted-foreground">Como os visitantes usam o site e o que vira venda.</p>
        </div>
        <div role="group" aria-label="Período" className="inline-flex rounded-lg border border-border p-0.5">
          {([7, 30, 90] as AnalyticsDays[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {failed && <p className="text-sm text-destructive">Não foi possível carregar os dados.</p>}
      {(loading || (data && !current)) && (
        <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      )}

      {c && p && current && (
        <>
          {c.visits === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Ainda sem visitas neste período. Confira se o script de analytics está no site.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Acessos" value={c.visits.toLocaleString("pt-BR")} change={percentChange(c.visits, p.visits)} />
            <Kpi label="Visitantes únicos" value={c.unique_visitors.toLocaleString("pt-BR")} change={percentChange(c.unique_visitors, p.unique_visitors)} />
            <Kpi label="Tempo médio no site" value={duration(c.avg_session_seconds)} change={percentChange(c.avg_session_seconds, p.avg_session_seconds)} />
            <Kpi label="Vendas" value={String(c.orders)} change={percentChange(c.orders, p.orders)} />
            <Kpi label="Faturamento" value={usd(c.revenue_cents)} change={percentChange(c.revenue_cents, p.revenue_cents)} />
            <Kpi label="Conversão" value={pct(c.orders, c.visits)} change={null} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Acessos por dia</CardTitle></CardHeader>
            <CardContent>
              <BarChart
                data={c.daily.map((d) => ({ day: d.day.slice(5).split("-").reverse().join("/"), Acessos: d.visits }))}
                index="day"
                categories={["Acessos"]}
                colors={["violet"]}
                showLegend={false}
                yAxisWidth={36}
                allowDecimals={false}
                className="h-[220px]"
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Funil</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {(
                  [
                    ["Visitou o site", c.funnel.visited],
                    ["Viu um produto", c.funnel.product_view],
                    ["Pôs no carrinho", c.funnel.add_to_cart],
                    ["Foi para o pagamento", c.funnel.checkout_start],
                    ["Pagou", c.funnel.paid],
                  ] as [string, number][]
                ).map(([label, n], i, all) => {
                  const top = all[0][1] || 1;
                  const prev = i > 0 ? all[i - 1][1] : null;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-sm">
                        <span>{label}</span>
                        <span className="tabular-nums">
                          {n}
                          {prev != null && prev > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">{pct(n, prev)} da etapa anterior</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-violet-500" style={{ width: `${Math.min(100, (n / top) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-3">
                <CardTitle className="text-base">Roupas</CardTitle>
                <div className="-mx-1 flex gap-1 overflow-x-auto">
                  {RANK_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      aria-pressed={tab === t.id}
                      className={cn(
                        "shrink-0 rounded-md px-2.5 py-1 text-xs",
                        tab === t.id ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {ranking.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {tab === "low" ? "Nenhuma roupa com 20+ visualizações e conversão abaixo de 2%." : "Sem dados no período."}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr><th className="pb-1.5 text-left font-normal">Roupa</th><th className="pb-1.5 text-right font-normal">Vistas</th><th className="pb-1.5 text-right font-normal">Giros</th><th className="pb-1.5 text-right font-normal">Carrinho</th><th className="pb-1.5 text-right font-normal">Vendidas</th></tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {ranking.slice(0, 10).map((r) => (
                        <tr key={r.slug} className="border-t border-border">
                          <td className="py-1.5">{r.slug}</td>
                          <td className="py-1.5 text-right">{r.views}</td>
                          <td className="py-1.5 text-right">{r.spins}</td>
                          <td className="py-1.5 text-right">{r.adds}</td>
                          <td className="py-1.5 text-right">{r.sold_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <ListCard title="Cores" rows={c.colors.map((x) => ({ label: x.value, value: `${x.picks} escolhas · ${x.sold} vendidas` }))} />
            <ListCard title="Tamanhos" rows={c.sizes.map((x) => ({ label: x.value, value: `${x.picks} escolhas · ${x.sold} vendidas` }))} />
            <ListCard title="De onde vêm" rows={c.sources.map((x) => ({ label: SOURCE_LABEL[x.value] ?? x.value, value: String(x.count) }))} />
            <ListCard
              title="Dispositivo e estado"
              rows={[
                ...c.devices.map((x) => ({ label: DEVICE_LABEL[x.value] ?? x.value, value: String(x.count) })),
                ...c.regions.map((x) => ({ label: x.value, value: String(x.count) })),
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, change }: { label: string; value: string; change: number | null }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        {change != null && (
          <p className={cn("mt-0.5 text-xs tabular-nums", change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {change >= 0 ? "+" : ""}{change}% vs. período anterior
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ListCard({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.slice(0, 10).map((r, i) => (
              <li key={`${r.label}-${i}`} className="flex justify-between gap-3">
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{r.value}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
