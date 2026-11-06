"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { summarizeCustomer } from "@/lib/store/customer-summary";
import type { OrderStatus } from "@/lib/store/types";
import { STATUS_LABEL, usd } from "./order-labels";

type Row = { id: string; display_number: string; status: OrderStatus; total_cents: number; paid_at: string | null; created_at: string };

async function fetchContactOrders(contactId: string): Promise<Row[] | null> {
  const res = await fetch(`/api/loja/orders?contact=${encodeURIComponent(contactId)}`);
  return res.ok ? (await res.json()).orders : null;
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

/** Aba "Compras" da ficha do contato (só contas de loja). */
export function ContactPurchases({ contactId }: { contactId: string }) {
  const [state, setState] = useState<{ id: string; rows: Row[] | null } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchContactOrders(contactId).then((rows) => alive && setState({ id: contactId, rows }));
    return () => {
      alive = false;
    };
  }, [contactId]);

  if (!state || state.id !== contactId) {
    return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-primary" /></div>;
  }
  if (!state.rows) return <p className="text-sm text-destructive">Não foi possível carregar as compras.</p>;
  if (state.rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma compra ainda.</p>;

  const s = summarizeCustomer(state.rows);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">Pedidos</dt><dd className="font-semibold tabular-nums">{s.count}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Total gasto</dt><dd className="font-semibold tabular-nums">{usd(s.totalCents)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Ticket médio</dt><dd className="font-semibold tabular-nums">{usd(s.avgCents)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Última compra</dt><dd className="font-semibold tabular-nums">{date(s.lastPurchaseAt)}</dd></div>
      </dl>
      <ul className="divide-y divide-border text-sm">
        {state.rows.map((o) => (
          <li key={o.id}>
            <Link href={`/pedidos?id=${o.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
              <span className="tabular-nums">{o.display_number}</span>
              <span className="text-xs text-muted-foreground">{date(o.paid_at ?? o.created_at)} · {STATUS_LABEL[o.status]}</span>
              <span className="tabular-nums">{usd(o.total_cents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
