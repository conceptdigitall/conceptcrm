"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usd } from "./order-labels";

type Rate = { id: string; carrier: string; service: string; amount_cents: number; days: number | null };
type RatesState = { orderId: string; rates: Rate[] | null; error: string | null };

async function fetchRates(orderId: string): Promise<RatesState> {
  const res = await fetch(`/api/loja/orders/${orderId}/rates`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const extra = Array.isArray(body.messages) && body.messages.length ? `: ${body.messages.join("; ")}` : "";
    return { orderId, rates: null, error: `${body.error ?? "Falha ao cotar"}${extra}` };
  }
  return { orderId, rates: body.rates, error: null };
}

/** Cotações do Shippo; a mais barata vem marcada. Confirmar compra a etiqueta. */
export function LabelDialog({
  orderId, onClose, onBought,
}: {
  orderId: string | null;
  onClose: () => void;
  onBought: () => void;
}) {
  const [state, setState] = useState<RatesState | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    fetchRates(orderId).then((s) => {
      if (!alive) return;
      setState(s);
      setPicked(s.rates?.[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  const current = state && state.orderId === orderId ? state : null;

  const buy = async () => {
    if (!orderId || !picked) return;
    setBuying(true);
    const res = await fetch(`/api/loja/orders/${orderId}/label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rateId: picked }),
    });
    setBuying(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = Array.isArray(body.messages) && body.messages.length ? body.messages.join("; ") : body.error;
      toast.error(res.status === 409 ? "Este pedido já tem etiqueta ou mudou de etapa." : `Etiqueta não gerada: ${msg ?? "erro"}`);
      if (res.status === 409) onBought();
      return;
    }
    toast.success("Etiqueta pronta");
    if (body.labelUrl) window.open(body.labelUrl, "_blank", "noopener");
    onBought();
  };

  return (
    <Dialog open={Boolean(orderId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar etiqueta</DialogTitle>
          <DialogDescription>Escolha o frete. A etiqueta é cobrada na sua conta do Shippo.</DialogDescription>
        </DialogHeader>
        {!current ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : current.error ? (
          <p className="text-sm text-destructive">{current.error}</p>
        ) : (
          <ul className="space-y-2" role="radiogroup">
            {current.rates!.map((r, idx) => (
              <li key={r.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked === r.id}
                  onClick={() => setPicked(r.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm",
                    picked === r.id ? "border-primary bg-primary-soft" : "border-border hover:bg-muted",
                  )}
                >
                  <span>
                    <span className="font-medium">{r.carrier}</span> {r.service}
                    {r.days != null && <span className="text-muted-foreground"> · {r.days} dia{r.days === 1 ? "" : "s"}</span>}
                    {idx === 0 && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">mais barato</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{usd(r.amount_cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={buy} disabled={!picked || buying || !current?.rates}>
            {buying && <Loader2 className="mr-2 size-4 animate-spin" />}Comprar e imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
