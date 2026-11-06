"use client";

// Configurações → Loja. Textos em pt-BR direto no componente: o módulo Loja
// é só para CRMs de clientes em português (ver ledger, Task 4).

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";
import type { Address, Box, StoreProduct } from "@/lib/store/types";

type Flags = {
  hasStripeKey: boolean;
  hasStripeWebhookSecret: boolean;
  hasShippoKey: boolean;
  hasShippoWebhookToken: boolean;
  hasResendKey: boolean;
};

type Form = {
  storeName: string;
  orderPrefix: string;
  siteUrl: string;
  emailFrom: string;
  reviewUrl: string;
  sender: Address;
  box: { length: string; width: string; height: string; weight_oz: string };
};

const EMPTY_ADDRESS: Address = { name: "", street1: "", street2: "", city: "", state: "", zip: "", country: "US", phone: "", email: "" };

const SECRET_FIELDS: { key: string; flag: keyof Flags; label: string }[] = [
  { key: "stripeSecretKey", flag: "hasStripeKey", label: "Stripe — chave secreta (sk_...)" },
  { key: "stripeWebhookSecret", flag: "hasStripeWebhookSecret", label: "Stripe — segredo do webhook (whsec_...)" },
  { key: "shippoApiKey", flag: "hasShippoKey", label: "Shippo — API token" },
  { key: "shippoWebhookToken", flag: "hasShippoWebhookToken", label: "Shippo — token do webhook (você escolhe)" },
  { key: "resendApiKey", flag: "hasResendKey", label: "Resend — API key (e-mails)" },
];

async function fetchSettings() {
  const res = await fetch("/api/loja/settings");
  return res.ok ? res.json() : null;
}

async function fetchProducts(): Promise<StoreProduct[]> {
  const res = await fetch("/api/loja/products");
  return res.ok ? (await res.json()).products : [];
}

const toCents = (dollars: string) => Math.round(Number(dollars.replace(",", ".")) * 100);
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function StoreSettingsPanel() {
  const { canEditSettings } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flags, setFlags] = useState<Flags | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Form>({
    storeName: "", orderPrefix: "EW", siteUrl: "", emailFrom: "", reviewUrl: "",
    sender: EMPTY_ADDRESS, box: { length: "10", width: "8", height: "2", weight_oz: "2" },
  });

  const apply = useCallback((data: { settings: Record<string, unknown> | null; flags: Flags } | null) => {
    setLoading(false);
    if (!data) return;
    setFlags(data.flags);
    const settings = data.settings as {
      storeName?: string; orderPrefix?: string; siteUrl?: string | null; emailFrom?: string | null;
      reviewUrl?: string | null; senderAddress?: Address | null; box?: Box | null;
    } | null;
    if (!settings) return;
    const box = settings.box;
    setForm({
      storeName: settings.storeName ?? "",
      orderPrefix: settings.orderPrefix ?? "EW",
      siteUrl: settings.siteUrl ?? "",
      emailFrom: settings.emailFrom ?? "",
      reviewUrl: settings.reviewUrl ?? "",
      sender: { ...EMPTY_ADDRESS, ...(settings.senderAddress ?? {}) },
      box: box
        ? { length: String(box.length), width: String(box.width), height: String(box.height), weight_oz: String(box.weight_oz) }
        : { length: "10", width: "8", height: "2", weight_oz: "2" },
    });
  }, []);

  useEffect(() => {
    let alive = true;
    fetchSettings().then((d) => alive && apply(d));
    return () => {
      alive = false;
    };
  }, [apply]);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/loja/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: form.storeName,
        orderPrefix: form.orderPrefix,
        siteUrl: form.siteUrl,
        emailFrom: form.emailFrom,
        reviewUrl: form.reviewUrl,
        senderAddress: form.sender,
        box: {
          length: Number(form.box.length), width: Number(form.box.width),
          height: Number(form.box.height), weight_oz: Number(form.box.weight_oz),
        },
        secrets,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error((await res.json().catch(() => null))?.error ?? "Não foi possível salvar");
      return;
    }
    toast.success("Configurações da loja salvas");
    setSecrets({});
    apply(await fetchSettings());
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const field = (label: string, value: string, onChange: (v: string) => void, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} disabled={!canEditSettings} {...props} />
    </div>
  );
  const setSender = (k: keyof Address) => (v: string) => setForm((f) => ({ ...f, sender: { ...f.sender, [k]: v } }));
  const setBox = (k: keyof Form["box"]) => (v: string) => setForm((f) => ({ ...f, box: { ...f.box, [k]: v } }));

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Loja"
        description="Dados da loja, endereço de envio, chaves do Stripe e do Shippo, e o catálogo usado no checkout."
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Loja</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("Nome da loja", form.storeName, (v) => setForm((f) => ({ ...f, storeName: v })))}
          {field("Prefixo do pedido", form.orderPrefix, (v) => setForm((f) => ({ ...f, orderPrefix: v })), { maxLength: 6 })}
          {field("Endereço do site", form.siteUrl, (v) => setForm((f) => ({ ...f, siteUrl: v })), { placeholder: "https://..." })}
          {field("Link para avaliação (após entrega)", form.reviewUrl, (v) => setForm((f) => ({ ...f, reviewUrl: v })), { placeholder: "https://instagram.com/..." })}
          <div className="sm:col-span-2">
            {field("E-mail remetente", form.emailFrom, (v) => setForm((f) => ({ ...f, emailFrom: v })), { placeholder: "orders@suadominio.com" })}
            {!form.emailFrom && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                Configure o domínio para ativar os e-mails. Enquanto estiver vazio, nenhum e-mail é enviado ao cliente.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">De onde sai o pacote</CardTitle>
          <CardDescription>Usado pelo Shippo para cotar o frete e imprimir a etiqueta.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("Nome", form.sender.name, setSender("name"))}
          {field("Telefone", form.sender.phone ?? "", setSender("phone"))}
          {field("Endereço", form.sender.street1, setSender("street1"))}
          {field("Complemento", form.sender.street2 ?? "", setSender("street2"))}
          {field("Cidade", form.sender.city, setSender("city"))}
          <div className="grid grid-cols-2 gap-4">
            {field("Estado (sigla)", form.sender.state, setSender("state"), { maxLength: 2 })}
            {field("ZIP", form.sender.zip, setSender("zip"))}
          </div>
          {field("E-mail", form.sender.email ?? "", setSender("email"))}
          <div className="grid grid-cols-4 gap-2 sm:col-span-2">
            {field("Caixa: comp. (in)", form.box.length, setBox("length"), { inputMode: "decimal" })}
            {field("Largura (in)", form.box.width, setBox("width"), { inputMode: "decimal" })}
            {field("Altura (in)", form.box.height, setBox("height"), { inputMode: "decimal" })}
            {field("Peso caixa (oz)", form.box.weight_oz, setBox("weight_oz"), { inputMode: "decimal" })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chaves</CardTitle>
          <CardDescription>Ficam criptografadas e nunca aparecem de novo. Deixe em branco para manter a atual.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {SECRET_FIELDS.map((s) => (
            <div key={s.key} className="space-y-1.5">
              <Label className="flex items-center gap-2">
                {s.label}
                <span className={flags?.[s.flag] ? "text-xs text-emerald-600" : "text-xs text-muted-foreground"}>
                  {flags?.[s.flag] ? "configurada" : "não configurada"}
                </span>
              </Label>
              <Input
                type="password"
                autoComplete="off"
                value={secrets[s.key] ?? ""}
                onChange={(e) => setSecrets((p) => ({ ...p, [s.key]: e.target.value }))}
                disabled={!canEditSettings}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {canEditSettings && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !form.storeName.trim()}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar configurações
          </Button>
        </div>
      )}

      <ProductsCard canEdit={canEditSettings} />
    </div>
  );
}

type Draft = { slug: string; name: string; price: string; colors: string; sizes: string; weightOz: string; imageUrl: string };
const EMPTY_DRAFT: Draft = { slug: "", name: "", price: "", colors: "", sizes: "S, M, L, XL", weightOz: "6", imageUrl: "" };

function ProductsCard({ canEdit }: { canEdit: boolean }) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => setProducts(await fetchProducts()), []);
  useEffect(() => {
    let alive = true;
    fetchProducts().then((p) => alive && setProducts(p));
    return () => {
      alive = false;
    };
  }, []);

  const payload = (d: Draft) => ({
    slug: d.slug.trim(), name: d.name, priceCents: toCents(d.price), colors: list(d.colors),
    sizes: list(d.sizes), weightOz: Number(d.weightOz.replace(",", ".")), imageUrl: d.imageUrl,
  });

  const submit = async () => {
    if (!draft) return;
    const res = await fetch(editingId ? `/api/loja/products/${editingId}` : "/api/loja/products", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(draft)),
    });
    if (!res.ok) {
      toast.error((await res.json().catch(() => null))?.error ?? "Não foi possível salvar o produto");
      return;
    }
    toast.success("Produto salvo");
    setDraft(null);
    setEditingId(null);
    load();
  };

  const toggle = async (p: StoreProduct) => {
    await fetch(`/api/loja/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const edit = (p: StoreProduct) => {
    setEditingId(p.id);
    setDraft({
      slug: p.slug, name: p.name, price: (p.price_cents / 100).toFixed(2), colors: p.colors.join(", "),
      sizes: p.sizes.join(", "), weightOz: String(p.weight_oz), imageUrl: p.image_url ?? "",
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Produtos</CardTitle>
          <CardDescription>
            O checkout só aceita o que está aqui. O slug tem que ser igual ao do site; o peso é da peça embalada.
          </CardDescription>
        </div>
        {canEdit && !draft && (
          <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setDraft(EMPTY_DRAFT); }}>
            <Plus className="mr-1 size-4" />Novo
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {draft && (
          <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            {(
              [
                ["slug", "Slug (ex.: yhwh-tee)"], ["name", "Nome"], ["price", "Preço (US$)"],
                ["weightOz", "Peso (oz)"], ["colors", "Cores (separadas por vírgula)"],
                ["sizes", "Tamanhos (separados por vírgula)"], ["imageUrl", "Imagem (URL, opcional)"],
              ] as [keyof Draft, string][]
            ).map(([k, label]) => (
              <div key={k} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  disabled={k === "slug" && Boolean(editingId)}
                />
              </div>
            ))}
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <Button variant="ghost" onClick={() => { setDraft(null); setEditingId(null); }}>Cancelar</Button>
              <Button onClick={submit}>Salvar produto</Button>
            </div>
          </div>
        )}

        {products.length === 0 && !draft && (
          <p className="text-sm text-muted-foreground">Nenhum produto ainda.</p>
        )}
        <ul className="divide-y divide-border">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.name} <span className="text-muted-foreground">· {p.slug}</span></div>
                <div className="text-xs text-muted-foreground">
                  US$ {(p.price_cents / 100).toFixed(2)} · {p.colors.join(", ")} · {p.sizes.join(", ")} · {p.weight_oz} oz
                </div>
              </div>
              {canEdit && (
                <>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={p.active} onCheckedChange={() => toggle(p)} />
                    {p.active ? "À venda" : "Pausado"}
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => edit(p)}>Editar</Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
