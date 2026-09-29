# Prospecção e Marketing — design (v2)

Data: 2026-09-29 (substitui a v1 de 2026-09-28, que usava Mailerfind e Runway)
Status: aguardando revisão do João

## Objetivo

Adicionar duas abas ao CRM da própria Concept Digital (`wacrm`, projeto
Supabase `pkvlnhfzhjjsblotzoxn`), para **uso interno da agência**:

1. **Prospecção** — achar negócios locais (ex: barbearias e imobiliárias na
   Baixada Santista) pelo Google Maps e transformá-los em contatos do CRM.
2. **Marketing** — gerar vídeos curtos promocionais a partir de um prompt e
   fotos, com o mesmo motor do `/brag` (HyperFrames).

Não entra no produto vendido aos clientes por enquanto. Raspar o Google Maps
viola os termos do Google; o risco fica só com a Concept, que usa a
ferramenta para achar os próprios clientes. Nenhuma mensagem é disparada
automaticamente para os leads.

## Decisões

- Prospecção: `gosom/google-maps-scraper` (MIT) via sua REST API local, no
  lugar do Mailerfind (plano mais barato 97 €/mês).
- Vídeo: HyperFrames (Apache-2.0) + Claude API escrevendo a composição, no
  lugar do Runway. Custo por vídeo ≈ tokens do Claude.
- A Vercel não roda Chrome/FFmpeg nem o scraper. Por isso existe um
  **worker** separado, que por enquanto roda no Mac do João. Pedidos feitos
  com o Mac desligado ficam na fila até ele ligar.
- Sem credenciais por cliente: o worker usa as chaves do `.env` da Concept.

## Arquitetura

```
CRM (Vercel)  --cria pedido-->  Supabase (tabelas + Storage)  <--poll/grava--  Worker (Mac)
   abas Prospecção / Marketing       fila com status                 ├─ google-maps-scraper (Docker)
   mostram resultado                                                 └─ Claude API + hyperframes render
```

O CRM só escreve pedidos e lê resultados. O worker é o único que chama
scraper, Claude e HyperFrames. Trocar o Mac por um servidor depois é rodar o
mesmo worker em outro lugar, sem mudar o CRM.

## Dados (uma migration nova, aditiva)

Todas com `account_id` e RLS no mesmo padrão das tabelas existentes.

**`lead_searches`** — um pedido de prospecção
- `query` (ex: "barbearia"), `location` (ex: "Santos, SP"), `max_results`
- `status`: `pending | running | done | failed`, `error`, `result_count`
- `created_by`, `created_at`, `finished_at`

**`leads`** — um negócio encontrado
- `search_id` → `lead_searches`
- `place_id` (id do Google, **único por account** para evitar duplicado)
- `name`, `category`, `address`, `phone`, `website`, `email`, `rating`,
  `review_count`, `maps_url`, `raw` (jsonb)
- `score` (0–100) e `score_reasons` (text[])
- `status`: `novo | contatado | qualificado | descartado`
- `contact_id` → `contacts` (preenchido ao promover)

**`marketing_videos`**
- `prompt`, `image_paths` (text[] no Storage), `format`
  (`vertical | square | landscape`, padrão vertical), `tone`
- `status`: `pending | running | done | failed`, `error`
- `video_path`, `poster_path` (Storage), `created_by`, `created_at`

Storage: bucket privado `marketing` para fotos enviadas e vídeos gerados;
o CRM mostra por URL assinada.

## Prospecção

- Formulário: o que buscar + cidade + quantidade (padrão 50, máximo 200).
- Worker pega `pending`, marca `running`, chama o scraper, grava os `leads`
  (ignorando `place_id` já existente) e marca `done` com a contagem.
- **Score de oportunidade** (função pura, testável): pontos por não ter site,
  nota abaixo de 4,3, menos de 30 avaliações, ter telefone celular. Cada
  ponto vira um motivo legível em `score_reasons` ("Sem site").
- Tela: lista de buscas com status; tabela de leads ordenada por score, com
  filtros de status e busca, link pro Maps e pro WhatsApp (`wa.me`, abre
  manualmente, sem disparo).
- **Promover para Contato**: cria o contato no CRM (nome, telefone) e liga
  `contact_id`. Sem telefone, o botão fica desabilitado.

## Marketing (vídeo)

- Formulário: prompt, até 4 fotos, formato, tom (presets do Brag: default,
  polished, app-store, cinematic).
- Worker pega `pending`, baixa as fotos, pede à Claude uma composição
  HyperFrames de 15–25 s seguindo as regras criativas do Brag (gancho nos 2 s
  iniciais, texto legível, usar as fotos reais, sem jargão genérico), roda
  `hyperframes check` e `render`. Se o check falhar, devolve o erro à Claude
  para corrigir (até 2 tentativas) antes de marcar `failed`.
- Sobe `brag.mp4` e o poster pro Storage, marca `done`.
- Tela: formulário no topo, galeria com status, player, download e excluir.

## Erros

- Qualquer falha do worker marca o pedido como `failed` com mensagem
  legível; a tela oferece "tentar de novo" (volta pra `pending`).
- Pedido preso em `running` por mais de 30 min é devolvido pra `pending`
  quando o worker inicia (Mac desligou no meio).
- A tela avisa quando há pedidos pendentes há muito tempo ("worker offline?").

## Testes

- Vitest: função de score, mapeamento do JSON do scraper para `leads`,
  validação dos formulários, route handlers de criar pedido e promover.
- Worker: teste do ciclo de fila com Supabase e scraper mockados.
- Verificação manual no navegador das duas abas, e um vídeo real renderizado.

## Fora de escopo

Mensagens automáticas para leads, Instagram/Twitter, módulos por cliente,
abas para outros nichos, deploy do worker em servidor.
