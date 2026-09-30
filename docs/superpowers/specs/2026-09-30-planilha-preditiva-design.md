# Planilha Preditiva (parte A) — design

Data: 2026-09-30 · Status: aguardando revisão do João · Branch: `feat/planilha-preditiva`
(criada a partir de `feat/prospeccao-marketing`, que ainda não foi mergeada)

## Objetivo

Na aba Prospecção, o João cria uma coluna escrevendo só o título e o Laya preenche essa
coluna para todos os leads. Serve para filtrar e ordenar leads por critérios que ele inventa
na hora ("Parece ter dinheiro?", "Nicho: saúde, beleza, alimentação"), sem gastar token.

Este documento cobre só a **parte A**: a planilha funcionando com o modelo base do Laya.
A **parte B** (treino com dados sintéticos rotulados pela Claude, avaliado em colunas nunca
vistas) terá spec própria e usa os dados que a parte A deixa prontos (correções e medição
inicial).

### Decisões do João

- Linhas = leads da Prospecção (tabela `leads`, migration 044).
- Uso interno da Concept: mesmo bloqueio `NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS`.
- Parte A antes da B.
- O Laya roda no Mac, ao lado do worker, com GPU (MPS). Railway só quando virar produto
  para clientes; a troca é mudar `LAYA_URL`.

### Fora do escopo

Editar o título de uma coluna (apaga e cria outra), colunas que dependem de outras colunas,
exportar CSV, conversas do WhatsApp como linhas, treino (parte B), servidor no Railway.

## Arquitetura

```
Navegador (aba Prospecção)
  └─ POST /api/prospecting/columns ─┐          (Vercel, Next.js)
                                    ▼
                          Supabase: lead_columns (status = pending)
                                    ▲
  npm run worker (Mac) ── claimNext ┘
     └─ monta o texto de cada lead
     └─ POST {LAYA_URL}/v1/systemone/batch  →  npm run laya (Mac, laya-serve, 127.0.0.1)
     └─ grava lead_column_values em lotes de 32
```

A coluna é o próprio pedido da fila, no mesmo padrão de `lead_searches` e `marketing_videos`
(`worker/queue.ts`: `claimNext`, `requeueOrphaned`, filtro por contas internas).

## Dados (migration 045)

### `lead_columns`

| coluna | tipo | observação |
|---|---|---|
| id | uuid pk | |
| account_id | uuid | fk accounts, cascade |
| title | text | 1–120 caracteres, como o João escreveu |
| kind | text | `noul` \| `choice` \| `score` |
| options | text[] | `choice`: 2–8 opções distintas; `score`: níveis fixos; `noul`: vazio |
| instructions | text | pergunta enviada ao Laya, derivada do título |
| status | text | `pending` \| `running` \| `done` \| `failed` |
| error | text | mensagem legível quando `failed` |
| model | text | checkpoint que preencheu (ex.: `multilingual`) |
| filled_count | int | células preenchidas na última execução |
| duration_ms | int | tempo da última execução (para o resumo na tela) |
| created_by | uuid | |
| created_at, started_at, finished_at | timestamptz | |

Limite: 10 colunas por conta (checado na rota).

### `lead_column_values`

| coluna | tipo | observação |
|---|---|---|
| column_id | uuid | fk lead_columns, cascade |
| lead_id | uuid | fk leads, cascade |
| account_id | uuid | para RLS |
| value | text | `sim`/`não`, uma das opções, ou o nível da nota |
| confidence | numeric(4,3) | 0–1, vindo do Laya |
| corrected_value | text | preenchido quando o João corrige |
| corrected_by | uuid | |
| corrected_at | timestamptz | |
| updated_at | timestamptz | |

PK `(column_id, lead_id)`. Valor exibido = `corrected_value ?? value`.
**O worker nunca escreve em linhas com `corrected_value` não nulo** (nem em retry, nem ao
preencher leads novos). As correções são os dados de treino da parte B.

RLS igual à de `leads`: membros da conta leem; `agent` ou acima escreve. O worker usa a
service role e só processa contas internas.

## Título → tipo de coluna

Função pura `parseColumnTitle(title)` em `src/lib/prospecting/columns.ts`:

- termina com `?` → `noul`; `instructions` = o título.
- `Tema: a, b, c` (qualquer palavra antes de `:`, seguida de 2–8 opções separadas por vírgula)
  → `choice`; opções aparadas, sem repetidas (comparação sem acento e sem caixa).
- qualquer outro → `score` com níveis `baixo`, `médio`, `alto`; `instructions` = o título.
- inválido (vazio, > 120 caracteres, `:` com menos de 2 ou mais de 8 opções, opções repetidas)
  → erro com mensagem em português. A rota responde 400.

## Texto de cada lead

Função pura `buildLeadState(lead)` em `src/lib/prospecting/columns.ts`. Texto curto em
português, uma informação por linha, sem campos vazios:

nome, categoria, endereço (só cidade/bairro), nota e número de avaliações, "Tem site" ou
"Sem site", "Tem celular" ou "Só fixo", e do `raw` do Maps: descrição, categorias extras e
os itens de "Sobre" que existirem. Limite de ~1.500 caracteres (o Laya multilíngue lê até
1.024 tokens por padrão).

## Worker

Job novo `runColumnJob(db, column, deps)` em `worker/columns.ts`, com o Laya injetado
(`deps.laya`) para teste, igual aos jobs atuais.

1. Carrega os 500 leads mais recentes da conta e os valores já existentes da coluna.
2. Pula leads com valor já preenchido (retry preenche só o que falta) e leads com correção.
3. Envia em lotes de 32 para `POST {LAYA_URL}/v1/systemone/batch` com
   `{ states, questions: { col: { type, instructions, criteria } }, model: "multilingual" }`.
4. Converte cada resposta com `mapLayaAnswer(kind, options, answer)` → `{ value, confidence }`
   e faz upsert de cada lote.
5. Termina com `done`, `filled_count`, `duration_ms`, `model`.

Leads novos: ao terminar uma busca da Prospecção, o worker coloca de volta em `pending` as
colunas `done` da conta; o passo 2 faz com que só os leads novos sejam preenchidos.

Ordem na fila: buscas, depois colunas, depois vídeos (colunas são rápidas e interativas).

## Laya no Mac

- `npm run laya`: sobe `laya-serve` do ambiente Python do projeto com
  `LAYA_HOST=127.0.0.1`, `LAYA_PORT=8765`, `LAYA_MODELS=multilingual`, `LAYA_PRELOAD=1`.
  Fica só na máquina, fechado para a rede.
- O ambiente Python fica em `worker/laya/` (`uv venv --python 3.12`, `laya[serve]` com versão
  fixada). O `docs/worker.md` explica como criar.
- `.env.local`: `LAYA_URL=http://127.0.0.1:8765`. Sem ela, o worker não pega colunas e avisa
  na inicialização.

## Tela (aba Prospecção)

- As colunas atuais (Score, Negócio, Contato, Status) continuam fixas à esquerda; as colunas
  de IA vêm à direita; a última é o campo "Nova coluna IA…" (Enter cria).
- Quadro "Como escrever o título" com os três formatos.
- Célula: `✓ sim · 88%`. Confiança abaixo de 60% aparece acinzentada. Clique abre as opções;
  corrigida ganha um lápis e mostra 100%.
- Cabeçalho: título, tipo e situação ("processando…", "falhou" + Tentar de novo, "pronta").
  Menu: ordenar (mais prováveis primeiro), filtrar por valor, excluir.
- Resumo em cima: "124 linhas preenchidas em 3,2 s" (da última coluna pronta).
- Atualização por polling, igual à aba hoje. Só aparece para contas internas.

## Rotas (todas com `requireRole('agent')` + `isInternalAccount`, 403 fora)

- `POST /api/prospecting/columns` `{ title }` → cria (400 título inválido ou limite de 10).
- `POST /api/prospecting/columns/[id]/retry` → volta para `pending` (só `failed`).
- `DELETE /api/prospecting/columns/[id]` → exclui (cascade nos valores).
- `PATCH /api/prospecting/columns/[id]/values/[leadId]` `{ value }` → grava correção; o valor
  precisa ser uma das opções válidas do tipo da coluna.

## Erros

| situação | resultado |
|---|---|
| Laya desligado (conexão recusada) | `failed`: "Laya desligado: rode npm run laya" |
| Laya ocupado (503) | espera `Retry-After`, até 3 tentativas, depois `failed` |
| Falha num lote | lotes já gravados ficam; `failed`; retry preenche só o que falta |
| Worker morre no meio | `requeueOrphaned` devolve para `pending` na próxima partida |
| Resposta do Laya sem a coluna ou com valor fora das opções | lote `failed` com a mensagem |
| Coluna excluída durante o preenchimento | upsert falha por fk; o job termina sem erro |

## Testes (TDD)

- `parseColumnTitle`: os três formatos, acentos, opções repetidas, limites.
- `buildLeadState`: campos vazios omitidos, `raw` com e sem "Sobre", limite de tamanho.
- `mapLayaAnswer`: `noul` (limiar 0,5), `choice`, `score`, confiança.
- `runColumnJob` com Laya falso: sucesso, Laya desligado, 503 com retry, falha no meio,
  correções preservadas, só leads faltantes.
- Rotas: 403 conta externa, 400 título inválido, limite de 10, correção com valor inválido.

## Critério de sucesso

1. Coluna nova pronta para 500 leads em menos de 30 s no Mac do João, contando a espera na
   fila. É estimativa; a medição real fica registrada.
2. Correções salvas e nunca sobrescritas.
3. Medição inicial para a parte B: nas 3 primeiras colunas reais, comparar o Laya com a
   Claude em 50 leads (concordância por coluna), registrada em `docs/`.

## Dependências e riscos

- Precisa de leads reais: o scraper da Prospecção tem que rodar ao menos uma vez.
- `feat/prospeccao-marketing` precisa ser mergeada antes (ou junto).
- Modelo base: o teste inicial em português mostrou `choice` e `noul` razoáveis e `score`
  fraco; colunas de nota vão errar mais até a parte B.
- Memória: o modelo multilíngue ocupa ~1–2 GB de RAM no Mac enquanto `npm run laya` roda.
