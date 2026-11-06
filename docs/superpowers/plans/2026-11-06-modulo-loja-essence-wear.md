# Módulo Loja + CRM Essence Wear — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lojas clientes recebem cada venda paga no CRM, conduzem o pós-venda (preparar, etiqueta Shippo, envio, entrega) com e-mails automáticos e veem o comportamento dos visitantes do site.

**Architecture:** Módulo dentro do `conceptcrm`, desligado por padrão e ligado por conta via `NEXT_PUBLIC_STORE_ACCOUNT_IDS`. Lógica de domínio pura em `src/lib/store/*` (testável sem banco); rotas em `src/app/api/loja/*`; telas em `src/app/(dashboard)/pedidos` e `/loja`. Rotas públicas (checkout, webhooks, track) usam a service role presa à conta do deploy (`CRM_ACCOUNT_ID`). Stripe pelo SDK oficial; Shippo e Resend por `fetch` na API REST (sem SDK).

**Tech Stack:** Next.js 16.3.8 (ler `node_modules/next/dist/docs/` antes de criar rotas — AGENTS.md), Supabase (Postgres + RLS), next-intl, Vitest 4, `stripe` (npm), Shippo REST v1, Resend REST.

**Spec:** `docs/superpowers/specs/2026-11-06-modulo-loja-essence-wear-design.md`

## Global Constraints

- CRM em pt-BR (chaves novas em `messages/pt.json`; `en/es/ko.json` recebem as mesmas chaves em inglês). E-mails ao comprador em inglês.
- Toda tabela nova tem `account_id uuid not null references accounts(id) on delete cascade` e RLS com `is_account_member(account_id)` (leitura) e `is_account_member(account_id, 'agent')` (escrita), como em `043_appointments.sql`.
- Rotas públicas resolvem a loja por `deploymentAccountId()` (`src/lib/deployment-account.ts`); sem ela respondem **503** `{ error: 'store_not_configured' }`. A conta também precisa estar em `NEXT_PUBLIC_STORE_ACCOUNT_IDS`, senão **404**.
- **Ajuste à spec:** o slug público em `track.js?store=` sai; a loja de cada deploy é a do `CRM_ACCOUNT_ID` (um CRM por loja). `store_settings` não tem `slug`.
- Dinheiro sempre em centavos inteiros (`*_cents`), moeda `usd`.
- Chaves (Stripe, Shippo, Resend) gravadas com `encrypt()`/`decrypt()` de `src/lib/whatsapp/encryption.ts`; nunca devolvidas ao navegador (a API devolve só `hasStripeKey: boolean` etc.).
- Prefixo do número do pedido: `store_settings.order_prefix` (Essence: `EW`), exibido `#EW-1001`; sequência por conta começando em 1001.
- E-mails desligados enquanto `store_settings.email_from` for nulo → evento `email_skipped`.
- Status: `paid | preparing | label_ready | shipped | delivered | canceled | refunded`.
- Retenção de `store_events`: 13 meses.
- Commits com autor `sacconceptdigital@gmail.com` (senão o deploy fica UNKNOWN) e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Neste Mac o `git` do PATH falha (rtk); usar `/usr/bin/git`.

## Review Focus

1. **Carrinho adulterado** (quantidade 0, negativa, 1000; cor/tamanho fora da lista; slug inativo) → 400 com mensagem; nunca uma sessão Stripe. Teste na Task 4.
2. **Webhook Stripe repetido ou fora de ordem** (`checkout.session.completed` 2x; `charge.refunded` de pedido inexistente) → um pedido só; reembolso desconhecido é ignorado com 200. Teste na Task 5.
3. **Comprador sem telefone** (Apple Pay pode não mandar) → contato criado com `phone = ''` (o índice único de `022` ignora vazio) e casado por e-mail. Teste na Task 5.
4. **Botão clicado duas vezes / status já mudou em outra aba** → transição inválida devolve 409 e a UI recarrega o pedido; comprar etiqueta duas vezes não compra duas. Teste nas Tasks 3 e 8.
5. **Evento de analytics forjado ou em massa** (tipo desconhecido, `duration_ms` absurdo, 1000 req/min de um IP) → 400 / descartado / 429. Teste na Task 9.

---

### Task 1: Liga/desliga por conta e menu

**Files:**
- Create: `src/lib/store-accounts.ts`, `src/lib/store-accounts.test.ts`
- Modify: `src/components/layout/sidebar.tsx` (NavItem ganha `storeOnly?: boolean`; itens `/pedidos` ícone `Package`, `/loja` ícone `Store` logo após `/contacts`; `visible()` checa `isStoreAccount`), `src/components/layout/mobile-bottom-nav.tsx` (mesmo filtro, se listar itens), `messages/*.json` (`Sidebar.orders` "Pedidos", `Sidebar.store` "Loja")

**Interfaces:**
- Produces: `storeAccountIds(raw?: string): string[]`, `isStoreAccount(accountId: string | null | undefined, raw?: string): boolean` — mesma forma de `internal-accounts.ts`, lendo `process.env.NEXT_PUBLIC_STORE_ACCOUNT_IDS` literal.

- [ ] **Step 1: Teste** `isStoreAccount('a', 'a, b') === true`, `isStoreAccount('c', 'a,b') === false`, `isStoreAccount(null, 'a') === false`, `storeAccountIds(undefined)` → `[]`.
- [ ] **Step 2:** `npx vitest run src/lib/store-accounts.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `src/lib/store-accounts.ts`; ligar no sidebar e i18n.
- [ ] **Step 4:** `npx vitest run src/lib/store-accounts.test.ts && npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(loja): liga o módulo por conta (NEXT_PUBLIC_STORE_ACCOUNT_IDS)`.

### Task 2: Migração do banco

**Files:**
- Create: `supabase/migrations/059_store_module.sql`
- Modify: `supabase/complete_setup.sql` (anexar o mesmo conteúdo ao fim, como as migrações anteriores fizeram — conferir o padrão antes)

Conteúdo (colunas exatamente como na spec, seção "Dados"), mais:
- `store_settings`: `account_id` PK; `store_name text not null`, `order_prefix text not null default 'EW'`, `site_url text`, `sender_address jsonb` (`name, street1, street2, city, state, zip, country, phone, email`), `box jsonb` (`length, width, height` em polegadas, `weight_oz` da caixa vazia), `currency text default 'usd'`, colunas `*_enc text` para as 5 chaves, `email_from text`, `review_url text`, `next_order_number int not null default 1001`, `updated_at`.
- Função `public.store_next_order_number(p_account uuid) returns int` (`update store_settings set next_order_number = next_order_number + 1 ... returning next_order_number - 1`), `security definer`, `grant execute` só a `service_role`.
- `orders.status` com `check` nos 7 valores; `unique (account_id, number)`; `unique (payment_provider, payment_ref)`.
- `processed_webhooks (provider text, event_id text, account_id uuid, created_at, primary key (provider, event_id))`, sem políticas para `authenticated` (só service role).
- `store_events`: RLS só de leitura para membros; nenhuma política de insert (só service role grava).
- Função `public.store_purge_old_events() returns int` apagando `store_events` com `created_at < now() - interval '13 months'`; execute só `service_role`.

- [ ] **Step 1:** Escrever a migração.
- [ ] **Step 2:** Aplicar num **branch do Supabase** (MCP `create_branch` no projeto `pkvlnhfzhjjsblotzoxn`, depois `apply_migration`), nunca direto em produção. Rodar `select public.store_next_order_number('<conta de teste>')` duas vezes → `1001`, `1002`.
- [ ] **Step 3:** Conferir RLS: como usuário de outra conta, `select * from orders` → 0 linhas; `insert into store_events` como `authenticated` → erro.
- [ ] **Step 4:** `get_advisors` (security) sem alerta novo para as tabelas `store_*`/`orders*`/`shipments`.
- [ ] **Step 5:** Commit `feat(loja): tabelas de pedidos, envios e eventos (059)`. Apagar o branch do Supabase ao fim da Task 12.

### Task 3: Domínio puro (status, totais, número)

**Files:**
- Create: `src/lib/store/types.ts`, `src/lib/store/order-status.ts`, `src/lib/store/pricing.ts`, testes `*.test.ts` ao lado

**Interfaces:**
- Produces:
  - `type OrderStatus = 'paid'|'preparing'|'label_ready'|'shipped'|'delivered'|'canceled'|'refunded'`
  - `type OrderAction = 'start_preparing'|'label_bought'|'mark_shipped'|'mark_delivered'|'refund'`
  - `nextStatus(current: OrderStatus, action: OrderAction): OrderStatus | null` (null = inválido)
  - `type CartLine = { slug: string; color: string; size: string; qty: number }`
  - `type StoreProduct = { id: string; slug: string; name: string; price_cents: number; colors: string[]; sizes: string[]; weight_oz: number; image_url: string | null; active: boolean }`
  - `priceCart(lines: CartLine[], products: StoreProduct[]): { ok: true; items: PricedItem[]; subtotal_cents: number; weight_oz: number } | { ok: false; error: string }` com `PricedItem = { product: StoreProduct; color; size; qty; unit_cents }`
  - `formatOrderNumber(prefix: string, n: number): string` → `#EW-1001`

- [ ] **Step 1: Testes**
  - `nextStatus('paid','start_preparing') === 'preparing'`; `nextStatus('preparing','label_bought') === 'label_ready'`; `nextStatus('label_ready','mark_shipped') === 'shipped'`; `nextStatus('shipped','mark_delivered') === 'delivered'`; `refund` vale de `paid|preparing|label_ready` → `'refunded'`; `nextStatus('shipped','refund') === null`; `nextStatus('paid','mark_shipped') === null`; `nextStatus('delivered','start_preparing') === null`.
  - `priceCart`: 2 linhas válidas somam `subtotal_cents` e `weight_oz` (qty × peso); erro para `qty` 0, -1, 51 (máx. **50** por linha), cor ou tamanho fora da lista, slug inexistente, produto `active: false`, carrinho vazio, mais de **20** linhas.
  - `formatOrderNumber('EW', 1001) === '#EW-1001'`.
- [ ] **Step 2:** `npx vitest run src/lib/store` → FAIL.
- [ ] **Step 3:** Implementar (tabela de transições como `Record<OrderStatus, Partial<Record<OrderAction, OrderStatus>>>`).
- [ ] **Step 4:** `npx vitest run src/lib/store` → PASS.
- [ ] **Step 5:** Commit `feat(loja): regras de status e preço do pedido`.

### Task 4: Configurações da loja, produtos e checkout

**Files:**
- Create: `src/lib/store/settings.ts`, `src/lib/store/admin-client.ts` (cópia do padrão `src/lib/ai/admin-client.ts`), `src/lib/store/public-route.ts`, `src/app/api/loja/settings/route.ts`, `src/app/api/loja/products/route.ts` + `[id]/route.ts`, `src/app/api/loja/checkout/route.ts`, `src/app/(dashboard)/settings/loja/page.tsx` (conferir como as outras seções de Configurações são registradas e seguir), testes `src/app/api/loja/checkout/route.test.ts`, `src/lib/store/settings.test.ts`
- Modify: `package.json` (`npm i stripe`, versão atual estável conferida no npm)

**Interfaces:**
- Consumes: `priceCart`, `StoreProduct` (Task 3); `isStoreAccount` (Task 1).
- Produces:
  - `type StoreSecrets = { stripeSecretKey: string|null; stripeWebhookSecret: string|null; shippoApiKey: string|null; shippoWebhookToken: string|null; resendApiKey: string|null }`
  - `type StoreSettings = { accountId; storeName; orderPrefix; siteUrl: string|null; senderAddress: Address|null; box: Box|null; emailFrom: string|null; reviewUrl: string|null }`
  - `loadStoreSettings(db: SupabaseClient, accountId: string): Promise<{ settings: StoreSettings; secrets: StoreSecrets } | null>`
  - `publicStoreAccount(): { accountId: string } | NextResponse` (503/404 conforme Global Constraints)
  - `corsHeaders(siteUrl: string|null, origin: string|null): HeadersInit` — só ecoa `origin` se igual a `siteUrl`
  - `getStripe(secretKey: string): Stripe`

Checkout: `POST { lines: CartLine[] }` → `{ url }`. Sessão Stripe com `mode: 'payment'`, `line_items` montados de `PricedItem` (`price_data`, nome `"<produto> — <cor> / <tamanho>"`), `shipping_address_collection: { allowed_countries: ['US'] }`, `phone_number_collection: { enabled: true }`, `metadata: { account_id, cart: JSON.stringify(lines) }`, `success_url: siteUrl + '?checkout=success'`, `cancel_url: siteUrl + '?checkout=cancel'`. Não passar `payment_method_types`: as formas de pagamento (inclusive PayPal, se a conta tiver) ficam a cargo do painel do Stripe. Frete cobrado do cliente fica para decisão do Léo (fora do escopo): sem `shipping_options` nesta versão.

Tela Configurações → Loja: nome, prefixo, URL do site, endereço do remetente, caixa padrão, `email_from`, `review_url`, campos de senha para as 5 chaves (vazio = mantém), lista de produtos (criar/editar/desativar; preço em dólares convertido para centavos). Só `admin` grava (`requireRole('admin')`).

- [ ] **Step 1: Testes** (mockando Supabase e `stripe`): `PUT /settings` grava chaves cifradas e `GET` devolve `hasStripeKey: true` sem o valor; checkout com carrinho válido chama `checkout.sessions.create` com `unit_amount` do **banco** mesmo se o corpo trouxer `price`; checkout com `qty: 0` → 400 e `create` não chamado; sem `CRM_ACCOUNT_ID` → 503; conta fora de `NEXT_PUBLIC_STORE_ACCOUNT_IDS` → 404; `Origin` diferente de `site_url` → sem `Access-Control-Allow-Origin`; `OPTIONS` responde o preflight.
- [ ] **Step 2:** `npx vitest run src/app/api/loja src/lib/store` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Testes PASS + `npm run typecheck && npm run lint`.
- [ ] **Step 5:** Commit `feat(loja): configurações, produtos e checkout Stripe`.

### Task 5: Webhook do Stripe → pedido e cliente

**Files:**
- Create: `src/lib/store/orders.ts`, `src/lib/store/webhooks.ts`, `src/app/api/loja/webhooks/stripe/route.ts`, testes `src/lib/store/orders.test.ts`, `src/app/api/loja/webhooks/stripe/route.test.ts`, fixtures em `src/lib/store/__fixtures__/stripe-*.json`

**Interfaces:**
- Consumes: `loadStoreSettings`, `getStripe`, `priceCart`, `formatOrderNumber`.
- Produces:
  - `claimWebhook(db, provider: 'stripe'|'shippo', eventId: string, accountId: string): Promise<boolean>` (false = já processado; insert com `on conflict do nothing`)
  - `upsertCustomerContact(db, accountId, { name, email, phone }): Promise<string>` (contact id; casa por e-mail, depois por telefone normalizado; senão cria com `phone ?? ''`)
  - `createPaidOrder(db, accountId, session: Stripe.Checkout.Session): Promise<{ orderId: string; created: boolean }>`
  - `addOrderEvent(db, accountId, orderId, type: string, detail?: object): Promise<void>`

Rota: lê o corpo cru (`await req.text()`), `stripe.webhooks.constructEvent(body, sig, stripeWebhookSecret)`; inválida → 400. `checkout.session.completed` com `payment_status === 'paid'` → `createPaidOrder` (recalcula itens do `metadata.cart` com `priceCart` e confere `amount_subtotal`; divergência grava evento `amount_mismatch` mas mantém o pedido), evento `paid`, depois `sendOrderEmail(..., 'confirmed')`. **Ordem de execução: fazer a Task 6 antes desta** (ela não depende da 5). `charge.refunded` → pedido por `payment_ref` (payment_intent); se existir e `nextStatus(...,'refund')` válido, `refunded` + e-mail; senão 200 sem mudança. Erro inesperado → 500 (Stripe tenta de novo); a reivindicação em `processed_webhooks` é desfeita nesse caso.

- [ ] **Step 1: Testes:** assinatura inválida → 400; evento válido cria 1 pedido `paid` com número 1001 e itens congelados; o **mesmo** evento de novo → 200 e continua 1 pedido; sessão sem telefone → contato com `phone ''`; comprador com e-mail de contato existente → reaproveita o contato; `charge.refunded` de pedido inexistente → 200, nada muda; `charge.refunded` de pedido `shipped` → evento `refund_after_ship`, status não muda.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS + typecheck.
- [ ] **Step 5:** Commit `feat(loja): webhook Stripe cria pedido e cliente`.

### Task 6: E-mails ao comprador

**Files:**
- Create: `src/lib/store/emails.ts`, `src/lib/store/email-templates.ts`, `src/lib/store/emails.test.ts`

**Interfaces:**
- Produces:
  - `type OrderEmailKind = 'confirmed'|'shipped'|'delivered'|'refunded'`
  - `renderOrderEmail(kind, ctx: { storeName; orderNumber; customerName; items; totalCents; trackingNumber?; trackingUrl?; eta?; reviewUrl? }): { subject: string; html: string; text: string }`
  - `sendOrderEmail(db, accountId, orderId, kind): Promise<'sent'|'skipped'|'failed'>` — sem `email_from` ou `resend_api_key` → `skipped` + evento `email_skipped`; `POST https://api.resend.com/emails` com `Authorization: Bearer`; não-2xx → `failed` + evento `email_failed { kind, status }`; 2xx → evento `email_sent { kind, id }`.

Assuntos exatos: `Order #EW-1001 confirmed`, `Your order is on the way`, `Delivered!`, `Your refund is on its way`. HTML simples, inline, nome da loja no topo; nomes e endereços escapados.

- [ ] **Step 1: Testes:** assuntos exatos; `shipped` contém o `trackingUrl`; `delivered` contém `reviewUrl` só se houver; nome do cliente `<script>` sai escapado; `sendOrderEmail` com `email_from` nulo → `'skipped'` e `fetch` não chamado; Resend 500 → `'failed'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(loja): e-mails de pedido (Resend, desligados sem domínio)`.

### Task 7: Shippo — cotação, etiqueta e rastreio

**Files:**
- Create: `src/lib/store/shippo.ts`, `src/app/api/loja/orders/[id]/rates/route.ts`, `src/app/api/loja/orders/[id]/label/route.ts`, `src/app/api/loja/webhooks/shippo/route.ts`, testes ao lado, fixtures `src/lib/store/__fixtures__/shippo-*.json`

**Interfaces:**
- Consumes: `nextStatus`, `addOrderEvent`, `sendOrderEmail`, `claimWebhook`, `loadStoreSettings`.
- Produces:
  - `type Rate = { id: string; carrier: string; service: string; amount_cents: number; days: number|null }`
  - `getRates(apiKey, { from: Address; to: Address; parcel: { length; width; height; weight_oz } }): Promise<Rate[]>` — `POST https://api.goshippo.com/shipments/` com `async: false`, header `Authorization: ShippoToken <key>`, ordenadas por preço.
  - `buyLabel(apiKey, rateId): Promise<{ transactionId; trackingNumber; trackingUrl; labelUrl; eta: string|null }>` — `POST /transactions/` com `label_file_type: 'PDF_4x6'`, `async: false`; `status !== 'SUCCESS'` → lança `ShippoError` com `messages`.
  - `refundLabel(apiKey, transactionId): Promise<void>` (`POST /refunds/`).

Rotas: `GET rates` (pedido `paid|preparing`, peso = itens + `box.weight_oz`) → `{ rates }`; `POST label { rateId }` exige status `preparing` (senão 409) e que o pedido ainda não tenha `shipments` (senão 409 — evita compra dupla), grava `shipments`, status `label_ready`, evento `label_bought`. Erro do Shippo → 502 `{ error, messages }`, status não muda, evento `label_failed`. Webhook: `?token=` igual a `shippo_webhook_token` (senão 401); `track_updated` atualiza `tracking_status`/`eta`; `DELIVERED` → `nextStatus(...,'mark_delivered')` + `delivered_at` + e-mail `delivered`; idempotência por `claimWebhook('shippo', \`${tracking_number}:${status}:${status_date}\`)`.

- [ ] **Step 1: Testes:** `getRates` mapeia fixture e ordena; `buyLabel` com `status: 'ERROR'` lança `ShippoError`; rota `label` em pedido `paid` → 409; segunda compra → 409 e `buyLabel` não chamado; webhook com token errado → 401; `DELIVERED` em pedido `shipped` → `delivered` + e-mail; mesmo aviso 2x → um e-mail.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(loja): etiqueta e rastreio pelo Shippo`.

### Task 8: Tela Pedidos e ações

**Files:**
- Create: `src/app/api/loja/orders/route.ts` (GET lista), `src/app/api/loja/orders/[id]/route.ts` (GET detalhe com itens, envio, eventos), `src/app/api/loja/orders/[id]/actions/route.ts` (POST `{ action: 'start_preparing'|'mark_shipped'|'refund'|'resend_email', kind? }`), `src/app/(dashboard)/pedidos/page.tsx`, `src/components/store/orders-board.tsx`, `src/components/store/order-detail.tsx`, `src/components/store/label-dialog.tsx`, teste `src/app/api/loja/orders/[id]/actions/route.test.ts`
- Modify: `messages/*.json` (namespace `Orders`)

**Interfaces:**
- Consumes: `nextStatus`, `getStripe`, `refundLabel`, `sendOrderEmail`, `addOrderEvent`, `formatOrderNumber`, rotas `rates`/`label` da Task 7.

Ações: `mark_shipped` → `shipped`, `shipped_at`, e-mail `shipped`. `refund` → `stripe.refunds.create({ payment_intent })`; se houver etiqueta, `refundLabel` (falha dele vira evento, não bloqueia); status vem do webhook `charge.refunded`, mas a rota já marca `refunded` para a UI não esperar (o webhook vira no-op). Transição inválida → 409. Só membros `agent+`.

UI: colunas Pago, Em produção, Etiqueta pronta, Enviado, Entregue; filtro "Cancelados/Reembolsados"; cartão com número, cliente, itens (cor/tamanho), valor, "há N dias". Detalhe em painel lateral (Sheet do shadcn já usado no projeto) com endereço, itens, linha do tempo e os botões da spec; "Imprimir etiqueta" abre `label_url` em nova aba; em 409 mostra aviso e recarrega. Botões desabilitados com explicação quando falta chave em Configurações → Loja. Aviso "Configure o domínio para ativar os e-mails" quando `email_from` é nulo.

- [ ] **Step 1: Testes da rota:** `start_preparing` em `paid` → 200/`preparing`; de novo → 409; `mark_shipped` em `label_ready` envia e-mail `shipped`; `refund` chama `refunds.create` com o `payment_intent` do pedido; usuário de outra conta → 404.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar rotas e UI. **Step 4:** PASS + typecheck + lint.
- [ ] **Step 5:** Verificar no navegador (`npm run dev`, conta de teste em `NEXT_PUBLIC_STORE_ACCOUNT_IDS`, pedido inserido pela Task 5 via Stripe CLI): mover um pedido até "Etiqueta pronta" com o token de teste do Shippo; screenshot desktop e 390px.
- [ ] **Step 6:** Commit `feat(loja): tela de pedidos com etiqueta, envio e reembolso`.

### Task 9: Coleta de analytics (track)

**Files:**
- Create: `src/lib/store/track.ts`, `src/app/api/loja/track/route.ts`, `public/loja/track.js`, teste `src/lib/store/track.test.ts`
- Modify: `src/lib/rate-limit.ts` (`RATE_LIMITS.storeTrack = { limit: 120, windowMs: 60_000 }`)

**Interfaces:**
- Produces:
  - `type StoreEventType = 'page_view'|'heartbeat'|'product_view'|'product_spin'|'color_select'|'size_select'|'filter_click'|'add_to_cart'|'checkout_start'|'leave'` (compras não vêm do navegador: o dashboard lê `orders` direto)
  - `parseTrackPayload(body: unknown, headers: Headers): { ok: true; rows: StoreEventRow[] } | { ok: false; error: string }` — aceita `{ events: [...] }` até **20** eventos; ids `visitor_id`/`session_id` com até 64 chars `[A-Za-z0-9_-]`; `duration_ms` limitado a **0..60000** (descarta o evento se fora); `path`/`value`/`product_slug` cortados em 200 chars; `referrer_source` derivado do `referrer` (`instagram`, `facebook`, `google`, `tiktok`, `direct`, `other`); `device` de `User-Agent` (`mobile|tablet|desktop`); `country`/`region` de `x-vercel-ip-country`/`x-vercel-ip-country-region`. IP **não** é gravado.

`track.js` (vanilla, < 3 KB): `EssenceTrack.event(type, { product_slug?, value? })`; envia lote a cada 5 s e no `visibilitychange`/`pagehide` via `navigator.sendBeacon` (fallback `fetch keepalive`); `heartbeat` com `duration_ms` a cada 15 s só com a aba visível; `visitor_id` em `localStorage` (try/catch, sem storage gera um por página); `session_id` novo após 30 min sem evento; UTMs lidos da URL no `page_view`. Endpoint descoberto pelo `src` do próprio script.

- [ ] **Step 1: Testes:** tipo `purchase` → erro; 21 eventos → erro; `duration_ms: 999999` → evento descartado; referrer `https://l.instagram.com/...` → `instagram`; sem referrer → `direct`; UA de iPhone → `mobile`; cabeçalhos Vercel viram `country`/`region`; nenhum campo de IP no resultado. Rota: 121ª chamada do mesmo IP no minuto → 429.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(loja): coleta de eventos do site (track.js)`.

### Task 10: Dashboard da loja e retenção

**Files:**
- Create: `supabase/migrations/060_store_analytics_functions.sql`, `src/lib/store/analytics.ts`, `src/app/api/loja/analytics/route.ts`, `src/app/(dashboard)/loja/page.tsx`, `src/components/store/analytics/*.tsx`, `src/app/api/loja/cron/retention/route.ts`, `vercel.json` (cron diário `0 7 * * *` → `/api/loja/cron/retention`), teste `src/lib/store/analytics.test.ts`
- Modify: `messages/*.json` (namespace `StoreAnalytics`)

**Interfaces:**
- Consumes: `store_events`, `orders`, `order_items`.
- Produces: função SQL `public.store_analytics(p_account uuid, p_from timestamptz, p_to timestamptz) returns jsonb` (`security invoker`, só membros veem via RLS) com: `visits` (sessões distintas), `unique_visitors`, `avg_session_seconds` (soma de `duration_ms` de `heartbeat` + `leave` por sessão, média), `orders`, `revenue_cents`, `conversion` (pedidos / sessões), `funnel` (sessões com `page_view`, `product_view`, `add_to_cart`, `checkout_start`, pedidos pagos), `products` (por slug: `views`, `spins`, `adds`, `sold_qty`), `colors` e `sizes` (contagem de `color_select`/`size_select` + itens vendidos), `sources`, `devices`, `regions` (top 10), `daily` (visitas por dia). `loadStoreAnalytics(db, accountId, days: 7|30|90): Promise<{ current: StoreAnalytics; previous: StoreAnalytics }>` chama a função para o período e o anterior de mesmo tamanho. `lowConversion(products)`: produtos com `views >= 20` e `sold_qty / views < 0.02`, ordenados por views.

Cron: header `Authorization: Bearer ${process.env.CRON_SECRET}` (padrão da Vercel); senão 401; chama `store_purge_old_events()` via service role.

UI: seletor 7/30/90 dias; cartões com variação vs período anterior; funil com % de queda; ranking de roupas (abas: vistas, giradas, carrinho, vendidas, "muito vista, pouco vendida"); cores e tamanhos; origem/dispositivo/estados; gráfico diário (reaproveitar a lib de gráficos já usada em `src/app/(dashboard)/dashboard/page.tsx`). Estado vazio: "Ainda sem visitas — confira se o script está no site".

- [ ] **Step 1: Testes:** `lowConversion` com 3 produtos de exemplo; `loadStoreAnalytics(…, 30)` pede `p_from` = agora − 30 d e o anterior = −60 d..−30 d; rota de retenção sem segredo → 401.
- [ ] **Step 2:** Aplicar a 060 no branch do Supabase, inserir eventos de exemplo (2 sessões, 1 `add_to_cart`, 1 pedido pago) e conferir o JSON de `store_analytics` à mão: `visits 2`, `funnel.add_to_cart 1`, `orders 1`.
- [ ] **Step 3:** FAIL nos testes de TS. **Step 4:** Implementar. **Step 5:** PASS + typecheck + lint; verificar a tela no navegador (desktop e 390px).
- [ ] **Step 6:** Commit `feat(loja): dashboard de analytics e retenção de 13 meses`.

### Task 11: Compras na ficha do contato

**Files:**
- Create: `src/components/store/contact-purchases.tsx`, `src/lib/store/customer-summary.ts`, teste `src/lib/store/customer-summary.test.ts`
- Modify: `src/app/(dashboard)/contacts/page.tsx` (onde o detalhe do contato é renderizado — localizar o painel de detalhe e incluir a seção só quando `isStoreAccount`)

**Interfaces:**
- Produces: `summarizeCustomer(orders: { total_cents: number; status: OrderStatus; paid_at: string }[]): { count: number; totalCents: number; avgCents: number; lastPurchaseAt: string|null }` — ignora `refunded`/`canceled`.

- [ ] **Step 1: Teste:** 3 pedidos (um `refunded`) → `count 2`, média dos 2, última data correta; lista vazia → zeros e `null`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar componente (lista com número, data, status, valor, link para o pedido em `/pedidos?id=`). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(loja): compras na ficha do contato`.

### Task 12: PR no modelo

- [ ] **Step 1:** `npm run test && npm run typecheck && npm run lint && npm run build` → tudo verde.
- [ ] **Step 2:** Conferir que, com `NEXT_PUBLIC_STORE_ACCOUNT_IDS` vazio, o menu e as rotas da Concept não mudam (abrir `/dashboard`, `/pedidos` → 404/redireciona).
- [ ] **Step 3:** Revisão de branch inteira (superpowers:requesting-code-review).
- [ ] **Step 4:** Push `feat/modulo-loja` e abrir PR no `conceptdigitall/conceptcrm` descrevendo: migrações 059/060 (aplicar em produção só ao mesclar, pelo João), novas variáveis (`NEXT_PUBLIC_STORE_ACCOUNT_IDS`, `CRON_SECRET`), nada muda para a Concept. **Não mesclar sem o OK do João.**
- [ ] **Step 5:** Apagar o branch do Supabase de teste.

### Task 13: Site Essence Wear (repositório `narrow-gate-demo`)

**Files (outro repo, `Concept Digital/narrow-gate-demo`):**
- Modify: `index.html` (marca, checkout, eventos), `README.md`, `og.png` (nova capa com o nome)

- [ ] **Step 1:** Trocar "Narrow Gate Supply" por "Essence Wear" em título, logo, textos, `og:*` e rodapé; regenerar `og.png` (Chrome headless 1200×630).
- [ ] **Step 2:** `<script src="https://<CRM>/loja/track.js" defer>` com a URL do CRM vinda de uma constante `CRM_URL` no topo do script da página.
- [ ] **Step 3:** Chamar `EssenceTrack.event` em: abrir produto (`product_view`), girar (`product_spin`), escolher cor (`color_select`) e tamanho (`size_select`), filtro (`filter_click`), adicionar à sacola (`add_to_cart`), Checkout (`checkout_start`). Os slugs dos produtos no site = `store_products.slug`.
- [ ] **Step 4:** Botão Checkout: `POST CRM_URL + '/api/loja/checkout'` com `{ lines }`, botão em estado "carregando", erro mostrado na sacola; sucesso → `location.href = url`. `?checkout=success` mostra o "Thank you" atual (texto de demo trocado por "Your order is confirmed — check your email") e limpa a sacola; `?checkout=cancel` reabre a sacola.
- [ ] **Step 5:** Testar contra o CRM local com chaves de **teste** do Stripe (cartão `4242 4242 4242 4242`) e `stripe listen --forward-to localhost:3000/api/loja/webhooks/stripe`: pedido aparece em Pedidos, eventos aparecem em Loja. Verificar 390px sem rolagem lateral.
- [ ] **Step 6:** Commit no repo da loja `feat: Essence Wear + checkout Stripe + analytics`; deploy só depois que o CRM Essence Wear estiver no ar (Task 14).

### Task 14: Instância CRM Essence Wear (operacional)

Segue a receita `SimpleBrain/wiki/crm-instancia-cliente.md`. Itens marcados **(João/Léo)** dependem de pessoas ou de permissão; o agente prepara e para.

- [ ] **Step 1:** Depois do PR mesclado: `Projetos/CRM Essence Wear` = clone do `conceptcrm`, branch `cliente/essence-wear`, remote `modelo`; `REQUIRE_DEPLOYMENT_ACCOUNT = true`; marca (nome "Essence Wear CRM" em `messages/*.json` `Sidebar.title`, logo, cores).
- [ ] **Step 2:** Repo privado `conceptdigitall/crm-essence-wear` e projeto Vercel com as variáveis da receita + `NEXT_PUBLIC_STORE_ACCOUNT_IDS` + `CRON_SECRET`. **(João)** confirmar o deploy.
- [ ] **Step 3:** **(João)** Supabase → Redirect URLs com o domínio do CRM; **(Léo)** `/signup` com o e-mail dele; preencher `CRM_ACCOUNT_ID` e `NEXT_PUBLIC_STORE_ACCOUNT_IDS` com o id da conta; redeploy.
- [ ] **Step 4:** Em Configurações → Loja: dados da loja, endereço do remetente, caixa, produtos (3 camisetas, cores e tamanhos do site, preço e peso — **(Léo)** valores reais). **(Léo)** colar chaves de teste do Stripe e do Shippo; criar no Stripe o webhook `https://<CRM>/api/loja/webhooks/stripe` (eventos `checkout.session.completed`, `charge.refunded`) e no Shippo `https://<CRM>/api/loja/webhooks/shippo?token=<token>`.
- [ ] **Step 5:** Deploy do site da loja (Task 13) apontando para o CRM; teste ponta a ponta em modo teste (compra → Pedidos → etiqueta de teste → enviado → analytics).
- [ ] **Step 6:** **(Léo)** trocar para as chaves reais quando a conta Stripe for ativada; **(João)** domínio comprado → Resend verificado → preencher `email_from`.
- [ ] **Step 7:** Checkpoint no SimpleBrain e linha do Essence Wear no `projects/PAINEL.md`.
