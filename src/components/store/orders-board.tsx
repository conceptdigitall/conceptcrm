"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Loader2, Package } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { isStoreAccount } from "@/lib/store-accounts";
import type { OrderStatus } from "@/lib/store/types";
import { cn } from "@/lib/utils";
import { BOARD_COLUMNS, CLOSED_STATUSES, STATUS_LABEL, daysSince, usd } from "./order-labels";
import { OrderDetail } from "./order-detail";

export type OrderListItem = {
  id: string;
  number: number;
  display_number: string;
  status: OrderStatus;
  customer_name: string | null;
  email: string | null;
  total_cents: number;
  created_at: string;
  status_changed_at: string | null;
  items: { product_name: string; color: string | null; size: string | null; quantity: number }[];
};

export type OrdersConfig = { emailsEnabled: boolean; hasShippo: boolean; hasStripe: boolean };

async function fetchOrders(): Promise<{ orders: OrderListItem[]; config: OrdersConfig } | null> {
  const res = await fetch("/api/loja/orders");
  return res.ok ? res.json() : null;
}

export function OrdersBoard() {
  const { account } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openId = searchParams.get("id");
  const [data, setData] = useState<{ orders: OrderListItem[]; config: OrdersConfig } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  const reload = useCallback(async () => {
    setData(await fetchOrders());
  }, []);

  useEffect(() => {
    let alive = true;
    fetchOrders().then((d) => {
      if (!alive) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const byStatus = useMemo(() => {
    const map = new Map<OrderStatus, OrderListItem[]>();
    for (const o of data?.orders ?? []) map.set(o.status, [...(map.get(o.status) ?? []), o]);
    return map;
  }, [data]);

  const setOpen = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("id", id);
    else params.delete("id");
    router.replace(`/pedidos${params.size ? `?${params}` : ""}`, { scroll: false });
  };

  if (account && !isStoreAccount(account.id)) {
    return <p className="text-sm text-muted-foreground">Esta conta não tem o módulo Loja.</p>;
  }

  const closed = CLOSED_STATUSES.flatMap((s) => byStatus.get(s) ?? []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada compra paga no site aparece em Pago. Mova o pedido pelos botões do detalhe.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowClosed((v) => !v)}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {showClosed ? "Ver quadro" : `Cancelados e reembolsados (${closed.length})`}
        </button>
      </div>

      {data && (!data.config.hasShippo || !data.config.emailsEnabled) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            {!data.config.hasShippo && <p>Shippo não configurado: não dá para gerar etiquetas.</p>}
            {!data.config.emailsEnabled && <p>Configure o domínio para ativar os e-mails ao cliente.</p>}
            <Link href="/settings?tab=store" className="font-medium underline underline-offset-4">
              Configurações → Loja
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <p className="text-sm text-destructive">Não foi possível carregar os pedidos.</p>
      ) : showClosed ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {closed.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido cancelado ou reembolsado.</p>}
          {closed.map((o) => <OrderCard key={o.id} order={o} onOpen={() => setOpen(o.id)} />)}
        </div>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {BOARD_COLUMNS.map((status) => {
            const list = byStatus.get(status) ?? [];
            return (
              <section key={status} className="w-[78vw] shrink-0 snap-start rounded-xl bg-muted/50 p-2 sm:w-72 lg:w-auto">
                <header className="flex items-center justify-between px-1.5 pt-1 pb-2">
                  <h2 className="text-sm font-semibold">{STATUS_LABEL[status]}</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
                </header>
                <div className="space-y-2">
                  {list.length === 0 && (
                    <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">Vazio</p>
                  )}
                  {list.map((o) => <OrderCard key={o.id} order={o} onOpen={() => setOpen(o.id)} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {data && data.orders.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <Package className="size-8" />
          Nenhum pedido ainda. Assim que alguém pagar no site, ele aparece aqui.
        </div>
      )}

      <OrderDetail
        orderId={openId}
        config={data?.config ?? null}
        onClose={() => setOpen(null)}
        onChanged={reload}
      />
    </div>
  );
}

function OrderCard({ order, onOpen }: { order: OrderListItem; onOpen: () => void }) {
  const days = daysSince(order.status_changed_at ?? order.created_at);
  const stale = days >= 3 && (order.status === "paid" || order.status === "preparing");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-card p-3 text-left text-sm shadow-xs transition-colors hover:border-primary/40"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold tabular-nums">{order.display_number}</span>
        <span className="tabular-nums text-muted-foreground">{usd(order.total_cents)}</span>
      </div>
      <div className="mt-0.5 truncate">{order.customer_name ?? order.email ?? "Cliente"}</div>
      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        {order.items.slice(0, 3).map((i, idx) => (
          <li key={idx} className="truncate">
            {i.quantity}× {i.product_name}
            {(i.color || i.size) && ` · ${[i.color, i.size].filter(Boolean).join(" / ")}`}
          </li>
        ))}
        {order.items.length > 3 && <li>+{order.items.length - 3} itens</li>}
      </ul>
      <div className={cn("mt-2 text-xs", stale ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
        {days === 0 ? "hoje" : days === 1 ? "há 1 dia" : `há ${days} dias`}
      </div>
    </button>
  );
}
