"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Printer, RefreshCcw, Send, Truck } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Address, OrderStatus } from "@/lib/store/types";
import { EMAIL_KIND_LABEL, EVENT_LABEL, STATUS_LABEL, usd } from "./order-labels";
import { LabelDialog } from "./label-dialog";
import type { OrdersConfig } from "./orders-board";

type Detail = {
  order: {
    id: string; display_number: string; status: OrderStatus; customer_name: string | null; email: string | null;
    phone: string | null; shipping_address: Address | null; subtotal_cents: number; shipping_cents: number;
    tax_cents: number; total_cents: number; contact_id: string | null;
  };
  items: { id: string; product_name: string; color: string | null; size: string | null; quantity: number; unit_cents: number }[];
  shipment: { carrier: string | null; service: string | null; tracking_number: string | null; tracking_url: string | null; label_url: string | null; tracking_status: string | null } | null;
  events: { id: string; type: string; detail: Record<string, unknown>; created_at: string }[];
};

async function fetchDetail(id: string): Promise<Detail | null> {
  const res = await fetch(`/api/loja/orders/${id}`);
  return res.ok ? res.json() : null;
}

export function OrderDetail({
  orderId, config, onClose, onChanged,
}: {
  orderId: string | null;
  config: OrdersConfig | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { canSendMessages } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [labelOpen, setLabelOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (orderId) setDetail(await fetchDetail(orderId));
    onChanged();
  }, [orderId, onChanged]);

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    fetchDetail(orderId).then((d) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [orderId]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!orderId) return;
    setBusy(action);
    const res = await fetch(`/api/loja/orders/${orderId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    setBusy(null);
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) toast.warning("O pedido mudou em outro lugar. Atualizei a tela.");
    else if (!res.ok) toast.error(body.error ?? "Não foi possível concluir");
    else toast.success("Pedido atualizado");
    refresh();
  };

  const confirmRefund = () => {
    if (window.confirm("Reembolsar o valor total no Stripe? Se houver etiqueta, ela também é anulada.")) act("refund");
  };

  const o = detail?.order;
  const a = o?.shipping_address;
  const isCurrent = detail && o?.id === orderId;

  return (
    <Sheet open={Boolean(orderId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {!isCurrent || !o ? (
          <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="tabular-nums">{o.display_number}</SheetTitle>
              <SheetDescription>{STATUS_LABEL[o.status]} · {usd(o.total_cents)}</SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6 text-sm">
              {canSendMessages && (
                <div className="flex flex-wrap gap-2">
                  {o.status === "paid" && (
                    <Button onClick={() => act("start_preparing")} disabled={busy !== null}>
                      {busy === "start_preparing" && <Loader2 className="mr-2 size-4 animate-spin" />}Começar a preparar
                    </Button>
                  )}
                  {o.status === "preparing" && (
                    <Button onClick={() => setLabelOpen(true)} disabled={!config?.hasShippo} title={config?.hasShippo ? undefined : "Configure o Shippo em Configurações → Loja"}>
                      <Truck className="mr-2 size-4" />Gerar etiqueta
                    </Button>
                  )}
                  {detail.shipment?.label_url && (
                    <Button variant="outline" onClick={() => window.open(detail.shipment!.label_url!, "_blank", "noopener")}>
                      <Printer className="mr-2 size-4" />Imprimir etiqueta
                    </Button>
                  )}
                  {o.status === "label_ready" && (
                    <Button onClick={() => act("mark_shipped")} disabled={busy !== null}>
                      {busy === "mark_shipped" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                      Marcar como enviado
                    </Button>
                  )}
                  {(o.status === "paid" || o.status === "preparing" || o.status === "label_ready") && (
                    <Button variant="ghost" className="text-destructive" onClick={confirmRefund} disabled={busy !== null || !config?.hasStripe}>
                      {busy === "refund" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
                      Cancelar e reembolsar
                    </Button>
                  )}
                </div>
              )}
              {!config?.emailsEnabled && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Configure o domínio para ativar os e-mails.</p>
              )}

              <section>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cliente</h3>
                <p className="font-medium">{o.customer_name ?? "—"}</p>
                {o.email && <p className="text-muted-foreground">{o.email}</p>}
                {o.phone && <p className="text-muted-foreground">{o.phone}</p>}
                {a && (
                  <p className="mt-1.5 text-muted-foreground">
                    {a.street1}{a.street2 ? `, ${a.street2}` : ""}<br />{a.city}, {a.state} {a.zip}
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Itens</h3>
                <ul className="space-y-1">
                  {detail.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span>{i.quantity}× {i.product_name}<span className="text-muted-foreground"> · {[i.color, i.size].filter(Boolean).join(" / ")}</span></span>
                      <span className="tabular-nums">{usd(i.unit_cents * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-2 space-y-0.5 border-t border-border pt-2 text-muted-foreground">
                  <div className="flex justify-between"><dt>Frete cobrado</dt><dd className="tabular-nums">{usd(o.shipping_cents)}</dd></div>
                  <div className="flex justify-between"><dt>Imposto</dt><dd className="tabular-nums">{usd(o.tax_cents)}</dd></div>
                  <div className="flex justify-between font-medium text-foreground"><dt>Total</dt><dd className="tabular-nums">{usd(o.total_cents)}</dd></div>
                </dl>
              </section>

              {detail.shipment && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Envio</h3>
                  <p>{detail.shipment.carrier} {detail.shipment.service}</p>
                  {detail.shipment.tracking_number && (
                    <p className="text-muted-foreground">
                      Rastreio:{" "}
                      {detail.shipment.tracking_url ? (
                        <a className="underline underline-offset-4" href={detail.shipment.tracking_url} target="_blank" rel="noopener noreferrer">
                          {detail.shipment.tracking_number}
                        </a>
                      ) : detail.shipment.tracking_number}
                      {detail.shipment.tracking_status && ` · ${detail.shipment.tracking_status}`}
                    </p>
                  )}
                </section>
              )}

              <section>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Histórico</h3>
                <ol className="space-y-1.5">
                  {detail.events.map((e) => {
                    const kind = typeof e.detail?.kind === "string" ? e.detail.kind : null;
                    return (
                      <li key={e.id} className="flex items-start justify-between gap-3">
                        <span>
                          {EVENT_LABEL[e.type] ?? e.type}
                          {kind && <span className="text-muted-foreground"> ({EMAIL_KIND_LABEL[kind] ?? kind})</span>}
                          {e.type === "email_failed" && kind && canSendMessages && (
                            <button type="button" className="ml-2 text-xs underline underline-offset-4" onClick={() => act("resend_email", { kind })}>
                              Reenviar
                            </button>
                          )}
                        </span>
                        <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          </>
        )}
        <LabelDialog
          orderId={labelOpen ? orderId : null}
          onClose={() => setLabelOpen(false)}
          onBought={() => {
            setLabelOpen(false);
            refresh();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
