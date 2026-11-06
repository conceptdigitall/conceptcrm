# Módulo Loja (pedidos, pós-venda e analytics) + CRM Essence Wear

> Spec aprovada em conversa com o João em 2026-11-06. Primeiro cliente: **Essence Wear** (Léo,
> camisetas cristãs, EUA, estoque próprio). Segundo previsto: **Amelli Gifts** (canecas).

## Objetivo

Dar a lojas de e-commerce clientes da Concept um CRM que receba cada venda paga, conduza o
pós-venda (preparar, gerar e imprimir etiqueta, enviar, entregar) com e-mails automáticos ao
comprador, guarde os dados de cada cliente e mostre o comportamento dos visitantes no site
(acessos, tempo médio, roupas mais vistas/giradas/vendidas, cores e tamanhos, origem, funil).

**Por que no modelo (`conceptcrm`) e não só na cópia:** Essence Wear e Amelli precisam das mesmas
peças. O módulo é construído no CRM Concept, desligado por padrão, e cada CRM de loja nasce do
modelo pela receita de instância (SimpleBrain `wiki/crm-instancia-cliente.md`, fora deste repo),
com `git merge modelo/main`.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Idioma | CRM em pt-BR; e-mails ao comprador em inglês |
| Pagamento | **Stripe Checkout** (cartão, Apple Pay, Google Pay). PayPal pelo próprio Stripe se a conta do Léo tiver; senão, botão PayPal separado numa fase 2. Pedidos não dependem do provedor (`payment_provider`) |
| Contas | Léo cria Stripe e Shippo no nome dele e passa as chaves. Construímos e testamos com as chaves de **teste** dele |
| Frete | **Shippo** (cota USPS/UPS/FedEx, compra a etiqueta, PDF 4x6, webhook de rastreio) |
| Estoque | Próprio do Léo (não print-on-demand). Controle de estoque **fora do escopo** |
| E-mail | **Resend**. Loja ainda **sem domínio**: e-mails prontos mas desligados; o CRM mostra "Configure o domínio para ativar os e-mails". Liga quando houver domínio + 3 registros DNS |
| Busca no site | Não existe (3 produtos). "Mais procurada" = visualizações + giros + cliques em filtro. Busca e ranking de termos ficam para quando o catálogo crescer |
| Nome | A loja passa de "Narrow Gate Supply" para **Essence Wear** (site e CRM) |

## Liga/desliga por conta

`NEXT_PUBLIC_STORE_ACCOUNT_IDS` (lista separada por vírgula), mesmo padrão de
`src/lib/internal-accounts.ts`. Novo `src/lib/store-accounts.ts` com `isStoreAccount(accountId)`.
Só essas contas veem as abas **Pedidos** e **Loja** e a seção **Configurações → Loja**; as rotas
`/api/loja/*` autenticadas respondem 404 para as demais. Na Concept fica vazia: nada muda.

## Dados (migração `059_store_module.sql`)

Todas as tabelas com `account_id uuid not null references accounts(id)` e RLS de leitura/escrita
para membros da conta (mesmo padrão das tabelas atuais). Gravações vindas de fora (checkout,
webhooks, track) passam pelo servidor com a service role, presas à conta do deploy
(`CRM_ACCOUNT_ID`, `src/lib/deployment-account.ts`).

- `store_settings` (1 por conta): nome da loja, slug público, URL do site, endereço do remetente,
  caixa padrão (dimensões), moeda (`usd`), chaves criptografadas (`stripe_secret_key`,
  `stripe_webhook_secret`, `shippo_api_key`, `shippo_webhook_token`, `resend_api_key`),
  `email_from` (nulo = e-mails desligados), `review_url`. Criptografia com `ENCRYPTION_KEY`, o mesmo
  mecanismo das chaves de WhatsApp e da base de conhecimento.
- `store_products`: `slug` (único por conta), nome, preço em centavos, `colors text[]`,
  `sizes text[]`, `weight_oz`, imagem, `active`.
- `orders`: `number` (sequencial por conta, exibido `#EW-1001` com prefixo de `store_settings`),
  `status` (`paid` | `preparing` | `label_ready` | `shipped` | `delivered` | `canceled` |
  `refunded`), `contact_id`, `email`, `phone`, `customer_name`, `shipping_address jsonb`,
  `subtotal_cents`, `shipping_cents`, `tax_cents`, `total_cents`, `payment_provider`,
  `payment_ref` (id da sessão/pagamento, único), `paid_at`, `shipped_at`, `delivered_at`.
- `order_items`: `order_id`, `product_id`, nome/cor/tamanho congelados, `quantity`, `unit_cents`.
- `shipments`: `order_id`, `carrier`, `service`, `cost_cents`, `tracking_number`, `tracking_url`,
  `label_url`, `eta`, `tracking_status`, `shippo_transaction_id`.
- `order_events`: linha do tempo (`type`, `detail jsonb`, `created_at`), inclusive e-mails
  enviados/falhos e erros do Shippo.
- `processed_webhooks`: `(provider, event_id)` único, para processar cada aviso uma vez.
- `store_events` (analytics): `visitor_id`, `session_id`, `type`, `path`, `product_slug`,
  `value` (cor/tamanho/filtro), `referrer_source`, `utm_source/medium/campaign`, `device`,
  `country`, `region`, `duration_ms`, `created_at`. Índices por `(account_id, created_at)` e
  `(account_id, type, product_slug)`. Retenção: job apaga eventos com mais de 13 meses.

**Contatos:** a compra cria ou atualiza o contato existente (casando por e-mail, depois telefone).
O checkout exige telefone porque `contacts.phone` é obrigatório.

## Fluxo de pedido

```
paid ──[Começar a preparar]──> preparing ──[Gerar etiqueta]──> label_ready
  ──[Marcar como enviado]──> shipped ──(webhook Shippo DELIVERED)──> delivered
paid|preparing|label_ready ──[Cancelar e reembolsar]──> refunded
```

As transições válidas ficam numa função pura (`src/lib/store/order-status.ts`), usada pela API e
pela UI. Transição inválida → 409.

## Tela Pedidos (`/pedidos`)

- Kanban: Pago → Em produção → Etiqueta pronta → Enviado → Entregue (+ filtro Cancelados).
- Cartão: número, cliente, itens (cor/tamanho), valor, dias na coluna.
- Detalhe: dados do cliente e endereço, itens, linha do tempo, botões:
  - **Começar a preparar**
  - **Gerar etiqueta**: busca cotações no Shippo (peso = soma de `weight_oz` + caixa padrão),
    lista transportadoras com a mais barata marcada, Léo confirma, compra, grava `shipments` e
    mostra **Imprimir etiqueta** (PDF 4x6)
  - **Marcar como enviado**: envia e-mail "shipped"
  - **Cancelar e reembolsar**: reembolso total no Stripe (anula a etiqueta no Shippo se houver)
- Ficha do contato ganha a seção **Compras**: pedidos, total gasto, ticket médio, última compra.

## Aba Loja (`/loja`): analytics

Filtro 7/30/90 dias, comparação com o período anterior.

- Cartões: acessos, visitantes únicos, tempo médio no site, vendas, faturamento, conversão.
- Funil: visitou → viu produto → carrinho → checkout → pagou (% de queda por etapa).
- Ranking de roupas: mais vistas, mais giradas, mais no carrinho, mais vendidas, e "muito vista,
  pouco vendida".
- Cores e tamanhos mais escolhidos.
- Origem (Instagram, Google, direto, UTM), dispositivo, estados.
- Gráfico de acessos por dia.

Agregações em funções SQL (`security invoker`) chamadas pelo dashboard, para não trazer eventos
brutos ao navegador.

**Tempo médio:** soma de `duration_ms` dos `heartbeat` (a cada 15 s com a aba visível) e do aviso de
saída (`sendBeacon` em `visibilitychange`), por sessão, média entre sessões.

## APIs

| Rota | Quem chama | O que faz |
|---|---|---|
| `POST /api/loja/checkout` | site (público, CORS só da URL da loja) | Recebe `[{slug, color, size, qty}]`, **preço vem de `store_products`**, cria sessão Stripe (coleta endereço EUA e telefone), devolve a URL |
| `POST /api/loja/webhooks/stripe` | Stripe | Confere assinatura; `checkout.session.completed` → contato + pedido `paid` + e-mail "confirmed"; `charge.refunded` → `refunded` |
| `POST /api/loja/webhooks/shippo` | Shippo | Confere token; `track_updated` → atualiza `shipments`; `DELIVERED` → `delivered` + e-mail |
| `POST /api/loja/track` | site (público) | Valida tipo e campos, limite de envios por IP (`src/lib/rate-limit.ts`), grava `store_events`. Não guarda IP; país/estado vêm de `x-vercel-ip-country` / `x-vercel-ip-country-region` |
| `GET/POST /api/loja/orders/...` | CRM (logado) | Listar, detalhar, mudar status, cotar e comprar etiqueta, reembolsar, reenviar e-mail |

Webhooks: `processed_webhooks` impede pedido duplicado; erro de processamento devolve 500 para o
provedor tentar de novo.

## E-mails (inglês, marca Essence Wear)

| Gatilho | Assunto |
|---|---|
| Pago | Order #EW-1001 confirmed |
| Enviado | Your order is on the way (rastreio, link, previsão) |
| Entregue | Delivered! (+ pedido de avaliação com `review_url`) |
| Reembolsado | Your refund is on its way |

Com `email_from` vazio, nada é enviado e o evento fica registrado como `email_skipped`. Falha de
envio vira `email_failed` na linha do tempo, com botão "Reenviar".

## Site da loja (`narrow-gate-demo` → Essence Wear)

- Renomear marca (título, logo, textos, og).
- Botão Checkout chama `/api/loja/checkout` e redireciona ao Stripe; páginas de retorno
  `?checkout=success` (Thank you) e `?checkout=cancel` (volta ao carrinho).
- Script de analytics (`track.js`, servido pelo CRM em `/loja/track.js?store=<slug>`) com os
  eventos: `page_view`, `heartbeat`, `product_view`, `product_spin`, `color_select`,
  `size_select`, `filter_click`, `add_to_cart`, `checkout_start`. `purchase` vem do webhook.
- Ids: `visitor_id` aleatório em `localStorage` (com try/catch), `session_id` novo após 30 min
  parado.

## Erros

- Preço manipulado no navegador: ignorado, o servidor recalcula.
- Shippo fora do ar ou endereço inválido: pedido não muda de status; mensagem e "Tentar de novo".
- Chave ausente em Configurações → Loja: botão desabilitado com explicação.
- Produto inativo ou inexistente no checkout: 400 com mensagem para o site mostrar.

## Testes

- Vitest: transições de status, cálculo de totais/peso, handlers dos webhooks com payloads de
  exemplo (assinatura válida/inválida, evento repetido), validação do `track`, agregações.
- Ponta a ponta em modo teste: cartão de teste do Stripe (Stripe CLI para o webhook), etiqueta de
  teste do Shippo (grátis), e-mail numa caixa nossa quando houver domínio.

## Entrega

1. PR no `conceptcrm` (`feat/modulo-loja`) com migração, abas, APIs e testes; desligado para a
   Concept.
2. `conceptdigitall/crm-essence-wear` a partir do modelo, marca Essence Wear, Vercel, conta do Léo,
   `CRM_ACCOUNT_ID` + `NEXT_PUBLIC_STORE_ACCOUNT_IDS`.
3. Site renomeado e ligado ao checkout e ao analytics.
4. Teste ponta a ponta em modo teste; depois troca para as chaves reais do Léo.

## Fora do escopo

Controle de estoque, cupons, busca no site, SMS, PayPal separado (fase 2 se o Stripe não oferecer),
devoluções/troca de tamanho (tratadas manualmente), vários endereços de remetente.

## Pendências do Léo/João

- Léo: criar contas Stripe e Shippo; checar em Stripe → Settings → Payment methods se há PayPal.
- Comprar domínio para ligar os e-mails.
- Confirmar com o contador a regra de sales tax de roupas em Massachusetts.
- Preços reais e peso embalado de cada camiseta.
