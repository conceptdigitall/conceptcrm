# Funil Concept IA, Fase 1: Recepcionista + Agenda — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o robô livre do webhook da Evolution por uma recepcionista que faz 4 perguntas, classifica com Laya (Haiku de fallback), cria contato + deal no Kanban e, para lead quente, oferece 3 horários e cria reunião real no Google Meet.

**Architecture:**
- **Núcleo puro:** a lógica fica em `src/lib/reception/`, com dependências injetadas e testáveis sem rede:
  - máquina de estados
  - leitura da resposta
  - texto
  - horários
- **Orquestrador:** `runReception` liga o núcleo ao Supabase, à Laya, ao Haiku e ao Calendar. O webhook da Evolution, que já roda na Vercel, chama o orquestrador quando `reception_settings.enabled = true`. Desligado, o robô antigo segue igual.
- **Cron:** lembretes, follow-ups e health check da Evolution rodam numa rota de cron chamada por pinger externo, no mesmo padrão de `/api/automations/cron`.

**Tech Stack:** Next.js 16.3.8 (route handlers), Supabase (Postgres + RLS), Vitest, `@anthropic-ai/sdk`, Laya (`/v1/systemone/batch`), Google Calendar REST v3 (OAuth refresh token), Evolution API, Whisper (Groq ou OpenAI).

**Spec:** `docs/superpowers/specs/2026-10-13-funil-concept-ia-design.md` (seções M3, M4, Falhas, Segurança, Testes, Fase 1).

## Global Constraints

### Ambiente
- Rode `npm ci` no worktree antes de tudo. Ele não tem `node_modules`.
- Leia `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` e `04-functions/after.md` antes de mexer em rota. A versão do Next é a 16.3.8 e tem breaking changes.
- Git só via `/usr/bin/git`. O wrapper `rtk` quebra com "Bad CPU type".
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem push nem PR sem pedido do João.

### Banco
- Migração nova: `supabase/migrations/053_reception.sql`. Se o número colidir no merge, renumere.
- Tabelas novas com RLS por `account_id` via `is_account_member(account_id)`. Escrita só pelo service role.

### Regras de conversa
- **Nunca inicia conversa.** Só existem duas mensagens proativas:
  - lembrete de reunião já marcada
  - follow-up de morno, e só se houver mensagem do lead nas últimas 24h; senão vira nota no contato + aviso ao João
- **Sem preço nem prazo.** A tabela de planos ainda não existe (é o sub-projeto 2). Então qualquer valor em R$ ou prazo em dias/semanas/meses vindo do Haiku é bloqueado pelo guardrail.

### Classificação
- Laya:
  - `LAYA_URL` + `LAYA_API_KEY`
  - timeout 2500 ms, 1 tentativa
  - aceita a resposta se a probabilidade top-1 for ≥ 0.7
- Senão, ou se a Laya estiver offline, decide o Haiku `claude-haiku-4-5` via `arbitrateWithClaude`.

### Agenda
- Dias úteis seg–sex, 09h–18h, fuso `America/Sao_Paulo`.
- Call de 30 min. 3 horários dentro dos próximos 5 dias úteis, cada um com pelo menos 2h de antecedência.

### Saídas
| Saída | Regra |
|---|---|
| quente | `fatura && urgencia === 'agora'` |
| frio | `!fatura && urgencia === 'pesquisando'` |
| morno | o resto |

Nota (`score`) = `fatura?40 + agora?40 + temTime?10 + (interesses ≥1)?10`.

### Texto e logs
- Texto ao lead em pt-BR, sem markdown nem asterisco (regra já aplicada por `cleanReplyFormatting`).
- Logs novos mascaram telefone com `maskPhone`, que deixa só os 4 últimos dígitos.

### Segredos e configuração
- Segredos só em `.env.local` e nas variáveis da Vercel, documentados em `.env.local.example`. Nunca no banco.
- Pausa da IA: grava `conversations.ai_autoreply_disabled = true` + `ai_handoff_summary`. São as mesmas colunas que `feat/api-v1-pausar-ia` usa; essa branch ainda não está na main.

## Review Focus

1. **Duas mensagens seguidas do lead** (ex.: "sou dentista" + "de Santos" em 2 s): só uma transição de etapa e uma resposta. `saveSession` é condicional à etapa anterior, e a 2ª chamada que perde a corrida não responde. Teste na Task 8.
2. **1ª mensagem é só "oi", emoji ou figurinha:** a recepcionista cumprimenta e pergunta o nicho, sem contar como "não entendi". Teste na Task 8.
3. **Lead propõe horário fora da lista** ("pode ser quinta 15h?"): conta como `slot_none` e recebe mais 3 horários. Na 2ª recusa, vai para o João. Teste na Task 3.
4. **Laya e Haiku fora ao mesmo tempo:** o lead recebe a pergunta da etapa de novo (texto fixo) e isso não conta como "não entendi". Teste na Task 8.
5. **"Quanto custa?" no meio do fluxo:** se o Haiku citar R$ ou prazo, o guardrail troca pelo texto seguro com o link dos planos. Teste na Task 4.

---

### Task 1: Migração e tipos da recepção

**Files:**
- Create: `supabase/migrations/053_reception.sql`
- Create: `src/lib/reception/types.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `ReceptionStage = 'nicho'|'interesse'|'momento'|'urgencia'|'agendando'|'concluida'|'humano'`
  - `Outcome = 'quente'|'morno'|'frio'|'humano'`
  - `Interest = 'marketing_ia'|'trafego_ia'|'recepcionista_ia'|'crm'|'site_ecommerce'`
  - `Answers { nicho?: string; interesses?: Interest[]; fatura?: boolean; temTime?: boolean; urgencia?: 'agora'|'pesquisando' }`
  - `OfferedSlot { iso: string; label: string }`
  - `ReceptionSession { id; accountId; contactId; conversationId; dealId: string|null; stage: ReceptionStage; answers: Answers; unclearCount: number; outcome: Outcome|null; score: number|null; origin: string; offeredSlots: OfferedSlot[]; slotRounds: number; appointmentId: string|null }`
  - `ReceptionSettings { accountId; enabled: boolean; pipelineId: string; stageIds: { novo: string; agendado: string; morno: string; curioso: string; humano: string }; plansUrl: string; lastHealthAlertAt: string|null }`
  - `JobKind = 'lembrete'|'followup'`

- [ ] **Step 1: Rodar `npm ci` no worktree e ler os 2 guias do Next listados nas Global Constraints.**

- [ ] **Step 2: Escrever `053_reception.sql`**

  **`reception_settings`:**
  - `account_id uuid PK references accounts on delete cascade`
  - `enabled boolean not null default false`
  - `pipeline_id uuid references pipelines`
  - `stage_ids jsonb not null default '{}'`
  - `plans_url text not null default ''`
  - `last_health_alert_at timestamptz`
  - `updated_at timestamptz default now()`

  **`reception_sessions`:**
  - `id uuid PK default gen_random_uuid()`
  - `account_id uuid not null`
  - `contact_id uuid not null references contacts on delete cascade`
  - `conversation_id uuid not null unique references conversations on delete cascade`
  - `deal_id uuid references deals on delete set null`
  - `stage text not null default 'nicho'` (check nos 7 valores)
  - `answers jsonb not null default '{}'`
  - `unclear_count int not null default 0`
  - `outcome text` (check nos 4 valores ou null)
  - `score int`
  - `origin text not null default 'direto'`
  - `offered_slots jsonb not null default '[]'`
  - `slot_rounds int not null default 0`
  - `appointment_id uuid references appointments on delete set null`
  - `created_at`, `updated_at`

  **`reception_jobs`:**
  - `id uuid PK`
  - `account_id uuid not null`
  - `kind text check in ('lembrete','followup')`
  - `run_at timestamptz not null`
  - `status text not null default 'pending'` (check `pending|running|done|failed`)
  - `attempts int not null default 0`
  - `session_id uuid references reception_sessions on delete cascade`
  - `appointment_id uuid references appointments on delete cascade`
  - `error text`
  - `created_at`
  - índice `(status, run_at)`

  **Também:**
  - `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deal_id uuid references deals on delete set null`
  - RLS ligada nas 3 tabelas novas, com policy só de `SELECT` via `is_account_member(account_id)` (estilo de `043_appointments.sql`)

- [ ] **Step 3: Aplicar no Supabase local ou branch e conferir**

  Run: `npx supabase db reset` (ou aplique só a 053 numa branch do Supabase via MCP `create_branch` + `apply_migration`).
  Expected: sem erro. `select * from reception_sessions limit 1` roda.

- [ ] **Step 4: Escrever `types.ts` com os tipos de Interfaces e rodar `npm run typecheck`**

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  /usr/bin/git add supabase/migrations/053_reception.sql src/lib/reception/types.ts
  /usr/bin/git commit -m "feat(recepcao): tabelas e tipos da recepcionista"
  ```

---

### Task 2: Ler a resposta do lead (Laya → Haiku)

**Files:**
- Move: `worker/laya-client.ts` → `src/lib/laya/client.ts` (e `.test.ts` junto). `worker/laya-client.ts` passa a ser só `export * from '@/lib/laya/client'`, para `src` não depender de `worker`.
- Create: `src/lib/reception/classify.ts`
- Test: `src/lib/reception/classify.test.ts`

**Interfaces:**
- Consumes: `layaBatch(baseUrl, states, question, deps)`, `LayaQuestion`, `arbitrateWithClaude(text, question, options)`
- Produces:
  - `type Classify = (text: string, question: LayaQuestion, options: string[]) => Promise<string>`: devolve uma das `options` ou `'indefinido'`; lança erro só se Laya e Haiku falharem.
  - `makeClassify(deps: { laya?: (text: string, q: LayaQuestion) => Promise<LayaAnswer>; haiku: (text: string, q: LayaQuestion, options: string[]) => Promise<string> }): Classify`
  - `type StageReading = {kind:'humano'} | {kind:'unclear'} | {kind:'nicho'; nicho: string} | {kind:'interesse'; interesses: Interest[]} | {kind:'momento'; fatura: boolean; temTime: boolean} | {kind:'urgencia'; urgencia: 'agora'|'pesquisando'} | {kind:'slot'; index: number} | {kind:'slot_none'}`
  - `readAnswer(stage: ReceptionStage, text: string, session: ReceptionSession, classify: Classify): Promise<StageReading>`

**O que `readAnswer` faz:**
1. Sempre testa primeiro a pergunta `noul` "O lead está pedindo para falar com uma pessoa, humano ou atendente?". Se `sim`, devolve `humano`.
2. Depois lê a etapa:
   - **`nicho`:** texto aparado com ≥ 3 letras vira `{kind:'nicho', nicho: text.slice(0,120)}`; senão `unclear`.
   - **`interesse`:** 5 perguntas `noul` em paralelo, uma por `Interest`. Nenhuma `sim` vira `unclear`.
   - **`momento`:** 2 `noul` ("o negócio já fatura/vende?", "tem alguém ou time cuidando do atendimento?"). Se `fatura` vier `indefinido`, devolve `unclear`; `temTime` indefinido vira `false`.
   - **`urgencia`:** `choice` com `['agora','pesquisando']`.
   - **`agendando`:**
     - `/^\s*([1-3])\b/` vira `slot` com índice − 1.
     - Senão, `choice` com os `label` de `session.offeredSlots` + `'nenhum'`.
     - `'nenhum'` vira `slot_none`; `indefinido` vira `unclear`.

- [ ] **Step 1: Mover o cliente da Laya e rodar `npx vitest run src/lib/laya worker`**

  Expected: PASS, com os mesmos testes de antes.

- [ ] **Step 2: Escrever os testes que falham**

  ```ts
  it('aceita Laya com top-1 >= 0.7 sem chamar Haiku', async () => {
    const haiku = vi.fn()
    const c = makeClassify({ laya: async () => ({ probabilities: { agora: 0.82, pesquisando: 0.18 } }), haiku })
    expect(await c('quero já', q, ['agora','pesquisando'])).toBe('agora')
    expect(haiku).not.toHaveBeenCalled()
  })
  it('cai no Haiku quando top-1 < 0.7', ...)            // probabilidades 0.6/0.4 → retorna o valor do haiku
  it('cai no Haiku quando a Laya lança erro', ...)
  it('lança quando Laya e Haiku falham', ...)
  it('readAnswer: pedido de humano vence qualquer etapa', ...)
  it('readAnswer interesse: junta todos os noul = sim', ...) // marketing_ia + crm
  it('readAnswer agendando: "2" vira slot index 1 sem classificar', ...)
  it('readAnswer agendando: "pode ser quinta 15h?" vira slot_none', ...) // classify devolve 'nenhum'
  ```

- [ ] **Step 3: Rodar e ver falhar**

  Run: `npx vitest run src/lib/reception/classify.test.ts`
  Expected: FAIL, "makeClassify is not exported".

- [ ] **Step 4: Implementar `makeClassify` e `readAnswer` em `classify.ts`**

  - Para `noul`, `sim` quando `answer.noul >= 0.5` e confiança `max(p,1-p) >= 0.7`.
  - Para `choice`, use o top-1 de `probabilities`.
  - O Haiku recebe `options` + `'indefinido'`.

- [ ] **Step 5: Rodar e ver passar**

  Run: `npx vitest run src/lib/reception/classify.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  /usr/bin/git add -A src/lib/laya worker/laya-client.ts worker/laya-client.test.ts src/lib/reception/classify*
  /usr/bin/git commit -m "feat(recepcao): leitura das respostas com Laya e fallback Haiku"
  ```

---

### Task 3: Máquina de estados

**Files:**
- Create: `src/lib/reception/machine.ts`
- Test: `src/lib/reception/machine.test.ts`

**Interfaces:**
- Consumes: `ReceptionSession`, `StageReading`, `Answers`, `Outcome`
- Produces:
  - `scoreLead(a: Answers): { outcome: 'quente'|'morno'|'frio'; score: number }`, com as regras das Global Constraints
  - `type Action = {type:'ask'; stage:'nicho'|'interesse'|'momento'|'urgencia'; reask: boolean} | {type:'offer_slots'} | {type:'reoffer'} | {type:'book'; slot: OfferedSlot} | {type:'morno'} | {type:'frio'} | {type:'handoff'} | {type:'free_reply'} | {type:'silent'}`
  - `advance(s: ReceptionSession, r: StageReading): { session: ReceptionSession; action: Action }`, pura, sem I/O

**Regras de `advance`:**
- **Etapa `humano`:** sempre `silent`.
- **Etapa `concluida`:** `humano` leva a `handoff`; qualquer outra leitura leva a `free_reply`.
- **Leitura `humano`:** `stage='humano'`, `outcome='humano'`, ação `handoff`.
- **Leitura `unclear`:**
  - `unclearCount+1`.
  - Chegou a 2: `handoff` (stage/outcome `humano`).
  - Senão: `ask` com a mesma etapa e `reask:true`, ou `reoffer` se estiver em `agendando`.
- **Leitura válida:**
  - Grava em `answers`, zera `unclearCount` e vai para a próxima etapa (`nicho → interesse → momento → urgencia`).
  - Depois de `urgencia`, aplica `scoreLead`:
    - quente: `stage='agendando'`, ação `offer_slots`
    - morno ou frio: `stage='concluida'`, ação `morno` ou `frio`
- **Etapa `agendando`:**
  - `slot`: ação `book` com `offeredSlots[index]`. Índice fora da lista conta como `unclear`.
  - `slot_none`:
    - `slotRounds < 1`: `slotRounds+1` e ação `offer_slots`.
    - Senão: `handoff`.

- [ ] **Step 1: Escrever os testes que falham**

  Os testes cobrem:
  - `scoreLead` nos 4 cantos:
    - fatura+agora → quente, 80+
    - !fatura+pesquisando → frio
    - fatura+pesquisando → morno
    - !fatura+agora → morno
  - O caminho feliz `nicho→…→agendando` com `offer_slots`.
  - O 2º `unclear` seguido levando a `handoff`.
  - `unclear` depois de leitura válida voltando o contador para 1, não 2.
  - `slot_none` duas vezes: 1º `offer_slots`, 2º `handoff`. Este é o Review Focus 3.
  - Etapa `humano` com qualquer leitura dando `silent`.
  - `concluida` dando `free_reply`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `npx vitest run src/lib/reception/machine.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar `scoreLead` e `advance`**

- [ ] **Step 4: Rodar e ver passar**

  Run: `npx vitest run src/lib/reception/machine.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(recepcao): máquina de estados quente/morno/frio/humano`

---

### Task 4: Textos e guardrails

**Files:**
- Create: `src/lib/reception/compose.ts`
- Test: `src/lib/reception/compose.test.ts`

**Interfaces:**
- Consumes: `Action`, `OfferedSlot`, `cleanReplyFormatting`
- Produces:
  - `applyGuardrails(text: string, plansUrl: string): string`
  - `type Phrase = (goal: string, leadText: string) => Promise<string>`: Haiku, até 2 frases, tom da marca do prompt atual do webhook (blocos "DIRETRIZES DA MARCA" e "REGRAS RÍGIDAS" 1, 7, 8), sem a parte de preços
  - `makePhrase(anthropic: Anthropic): Phrase`
  - `formatOffer(slots: OfferedSlot[]): string`
  - `composeReply(action: Action, ctx: { leadText: string; plansUrl: string; firstName: string }, phrase: Phrase): Promise<string|null>`: `null` para `silent`, `book` e `offer_slots`, que o orquestrador monta
  - `COPY`: os textos fixos abaixo

**Textos fixos (`COPY`):**

| Chave | Texto |
|---|---|
| `ask.nicho` | `Oi! Aqui é da Concept Digital. Pra eu te ajudar melhor: qual é o seu negócio ou nicho?` |
| `ask.interesse` | `Legal! O que você quer resolver primeiro: marketing com IA, tráfego pago com IA, recepcionista de IA, CRM ou site/e-commerce? Pode ser mais de um.` |
| `ask.momento` | `Hoje o negócio já fatura? E tem alguém cuidando do atendimento?` |
| `ask.urgencia` | `Você quer começar agora ou ainda está pesquisando?` |
| `morno` | `Fechado! Os nossos planos estão aqui: {plansUrl}. Se bater alguma dúvida, é só me chamar.` |
| `handoff` | `Combinado, vou passar a conversa para o João. Ele te responde por aqui em breve.` |
| `calendarFail` | `Já te mando os horários disponíveis.` |
| `meetPending` | `Horário reservado! O link do Google Meet chega por aqui em seguida.` |
| `guardrail` | `Os valores e condições estão nos planos: {plansUrl}. Prazos o João confirma com você na call.` |
| `lembrete` | `Oi, {firstName}! Passando pra lembrar da nossa call hoje às {hora}. Link: {meetUrl}` |
| `followup` | `Oi, {firstName}! Conseguiu ver os planos? Se quiser, marco uma call rápida pra te mostrar na prática.` |

**Formato da oferta (`formatOffer`):**
- Texto: `Tenho estes horários para uma call de 30 min no Google Meet:\n1) {label}\n2) {label}\n3) {label}\nQual fica melhor? Responde com o número.`
- `label` vem de `Intl` pt-BR com weekday curto, dia/mês e hora (ex.: `ter, 14/10 às 10h`) e é gerado na Task 5.

**Como `composeReply` monta cada ação:**
- **`ask`:**
  - Chama `phrase` com o objetivo da etapa. Se `reask`, avisa no objetivo "o lead não respondeu de forma clara; reformule".
  - Se `phrase` lançar erro, usa `COPY.ask[stage]`.
  - Passa pelo guardrail.
- **`frio` e `free_reply`:** `phrase` com o objetivo "responder a dúvida em até 2 frases, sem insistir em venda", passando pelo guardrail.
- **`morno`, `handoff`, `reoffer`:** texto fixo; `reoffer` usa `formatOffer` com os slots que já estão na sessão.

**Regras do guardrail (`applyGuardrails`):**
- Se o texto casar com `/R\$\s?\d|\d+\s?(reais|mil)\b/i` ou com `/\b\d+\s?(dias?|semanas?|meses?)\b/i`, devolve `COPY.guardrail`.
- Senão, devolve `cleanReplyFormatting(text)`.

- [ ] **Step 1: Escrever os testes que falham**

  - `applyGuardrails('Fica R$ 1.200 por mês', url)` devolve `COPY.guardrail` com a URL. Este é o Review Focus 5.
  - `'Entrego em 15 dias'` é bloqueado.
  - `'Nossa call é ter, 14/10 às 10h'` passa.
  - `composeReply` com `ask` usa o texto fixo quando `phrase` rejeita.
  - `formatOffer` com 3 slots bate com a string exata acima.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `npx vitest run src/lib/reception/compose.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar e ver passar**

  Run: `npx vitest run src/lib/reception/compose.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(recepcao): textos da recepcionista e bloqueio de preço/prazo`

---

### Task 5: Escolher 3 horários (M4)

**Files:**
- Create: `src/lib/reception/slots.ts`
- Test: `src/lib/reception/slots.test.ts`

**Interfaces:**
- Consumes: `AvailableSlot` (`src/lib/calendar/rules.ts`), `getCalendarAvailability`, `loadBusyIntervals(db, accountId, dateStr)`
- Produces:
  - `pickOfferSlots(now: Date, loadDay: (dateStr: string) => Promise<AvailableSlot[]>, skip?: string[]): Promise<OfferedSlot[]>`
  - `slotLabel(d: Date): string`
  - `makeLoadDay(db: SupabaseClient, accountId: string, now: Date): (dateStr: string) => Promise<AvailableSlot[]>`: junta `loadBusyIntervals` com `getCalendarAvailability({ targetDate, existingBusyIntervals, now })`

**Algoritmo de `pickOfferSlots`:**
1. Percorra os próximos 5 dias seg–sex a partir de hoje, no fuso `America/Sao_Paulo`. Descarte slots com início < `now + 2h` e os `iso` em `skip`.
2. Escolha os slots:
   - 1º dia com vaga: o 1º horário.
   - 2º dia com vaga: o 1º horário ≥ 13:00, ou o 1º do dia se não houver.
   - 3º dia com vaga: o 1º horário.
3. Se houver menos de 3 dias com vaga, complete com os próximos horários livres dos dias já usados.
4. Devolva de 0 a 3 slots, em ordem cronológica.

- [ ] **Step 1: Escrever os testes que falham**

  Use `loadDay` falso e `now = 2026-10-13T08:00-03:00` (terça).
  - Sábado e domingo nunca aparecem: com sábado cheio de vagas, ele é pulado.
  - Slot às 09:00 de hoje é descartado, porque fica a menos de 2h de `now`.
  - 2º dia prefere a tarde.
  - Só 1 dia com vaga devolve 3 horários desse dia.
  - Nenhuma vaga devolve `[]`.
  - `skip` remove os já oferecidos.
  - `slotLabel(new Date('2026-10-14T13:00:00Z'))` é `'qua, 14/10 às 10h'`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `npx vitest run src/lib/reception/slots.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar e ver passar**

  Run: `npx vitest run src/lib/reception/slots.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(agenda): escolha de 3 horários nos próximos 5 dias úteis`

---

### Task 6: Reunião de verdade no Google Meet

O `createCalendarEvent` atual só cria evento real via webhook n8n. Sem ele, devolve o link genérico `https://meet.google.com/new`, que não é uma reunião. Esta task cria o evento real com OAuth da conta Google do João. Uma service account não cria Meet numa conta Gmail comum.

**Files:**
- Modify: `src/lib/calendar/google.ts` (`CreateEventResult`, `createCalendarEvent`)
- Modify: `src/lib/calendar/ai-calendar-tools.ts` (`ScheduleAppointmentToolParams` + `dealId`; resultado + `meetCreated`)
- Test: `src/lib/calendar/google.test.ts`, `src/lib/calendar/ai-calendar-tools.test.ts`

**Interfaces:**
- Produces:
  - `createMeetEvent(p: CreateEventParams, deps?: { fetchImpl?: typeof fetch }): Promise<{ eventId: string; meetUrl: string }>`
  - `CreateEventResult` ganha `meetCreated: boolean`
  - `ScheduleAppointmentToolParams` ganha `dealId?: string|null`, gravado em `appointments.deal_id`
  - `ScheduleAppointmentToolResult` ganha `meetCreated: boolean`

**Como `createMeetEvent` funciona:**
1. Troca o refresh token: `POST https://oauth2.googleapis.com/token` (form: `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token`).
2. Cria o evento: `POST https://www.googleapis.com/calendar/v3/calendars/{GOOGLE_CALENDAR_ID||'primary'}/events?conferenceDataVersion=1&sendUpdates=all`
   - corpo: `summary`, `description`, `start`/`end` (`dateTime` ISO, `timeZone: 'America/Sao_Paulo'`), `attendees` (o e-mail do cliente, se houver), `conferenceData.createRequest = { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } }`
3. Lê o link: `meetUrl = json.hangoutLink`. Se faltar, lança erro.

**Ordem em `createCalendarEvent`:**
1. Se `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` e `GOOGLE_OAUTH_REFRESH_TOKEN` existirem, tenta `createMeetEvent`. Sucesso devolve `meetCreated:true`.
2. Se falhar, segue para o webhook n8n.
3. Por último, o fallback atual, com `meetCreated:false`.

O webhook n8n só conta como `meetCreated:true` se devolver `meetUrl`.

- [ ] **Step 1: Escrever os testes que falham (`fetch` mockado)**

  - Com as 3 variáveis OAuth, o resultado traz `meetCreated:true` e `meetUrl` = `hangoutLink`.
  - A URL do POST contém `conferenceDataVersion=1`.
  - Token 400: cai no fallback com `meetCreated:false` e `meetUrl` = `https://meet.google.com/new`.
  - `executeScheduleAppointment` com `dealId` grava `deal_id` no insert.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `npx vitest run src/lib/calendar`
  Expected: FAIL nos testes novos; os antigos passam.

- [ ] **Step 3: Implementar e documentar as 4 variáveis em `.env.local.example`**

  Variáveis: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`. Escopo `https://www.googleapis.com/auth/calendar.events`.

- [ ] **Step 4: Rodar e ver passar**

  Run: `npx vitest run src/lib/calendar`
  Expected: PASS, todos.

- [ ] **Step 5: Commit**

  `feat(agenda): cria evento real com link do Google Meet via OAuth`

---

### Task 7: Efeitos no CRM, avisos e máscara de telefone

**Files:**
- Create: `src/lib/reception/crm.ts`, `src/lib/reception/ops.ts`, `src/lib/reception/store.ts`
- Test: `src/lib/reception/crm.test.ts`, `src/lib/reception/ops.test.ts`

**Interfaces:**

**`store.ts`:**
- `loadSettings(db, accountId): Promise<ReceptionSettings|null>`
- `loadSession(db, conversationId): Promise<ReceptionSession|null>`
- `createSession(db, input: { accountId; contactId; conversationId; dealId: string|null; origin: string }): Promise<ReceptionSession>`
- `saveSession(db, next: ReceptionSession, prevStage: ReceptionStage): Promise<boolean>`: `UPDATE … WHERE id = ? AND stage = prevStage`; devolve `false` se 0 linhas mudarem
- `enqueueJob(db, j: { accountId; kind: JobKind; runAt: Date; sessionId?: string; appointmentId?: string }): Promise<void>`
- Faz o mapeamento snake_case ↔ camelCase.

**`crm.ts`:**
- `ensureDeal(db, a: { accountId; userId; contactId; conversationId; settings: ReceptionSettings; title: string }): Promise<string>`: reaproveita deal `status='active'` do contato no `pipelineId`; senão cria no estágio `novo`, com `currency 'BRL'` e `value 0`
- `moveDeal(db, dealId, stageId): Promise<void>`
- `tagContact(db, a: { accountId; userId; contactId; tagName: string }): Promise<void>`: acha ou cria a tag por (`account_id`, `name`); `upsert` em `contact_tags` com `onConflict 'contact_id,tag_id'`
- `pauseAi(db, conversationId, summary: string): Promise<void>`
- `addNote(db, a: { contactId; userId; text }): Promise<void>`

**`ops.ts`:**
- `maskPhone(p: string): string`: `'***' + últimos 4 dígitos`
- `notifyOps(text: string, deps?: { fetchImpl?; sendWhatsApp?: (n: string, t: string) => Promise<unknown> }): Promise<void>`
  - Com `TELEGRAM_BOT_TOKEN` e `TELEGRAM_OPS_CHAT_ID`, faz `POST https://api.telegram.org/bot{token}/sendMessage` com `{chat_id, text}`.
  - Senão, manda via `sendWhatsApp` para `ADMIN_WHATSAPP_NUMBERS`.
  - Nunca lança erro.
- `parseOrigin(text: string): string`: `/#([a-z0-9]{6})\b/i` vira o código em minúsculas; sem código, `'direto'`. Este é o formato que a Fase 2 (M2) vai pôr no `wa.me`.

- [ ] **Step 1: Escrever os testes que falham**

  Use um builder de Supabase mockado no estilo de `src/lib/contacts/tag-write.test.ts`.
  - `ensureDeal` reaproveita o deal ativo existente sem inserir outro.
  - `tagContact` cria a tag `curioso` quando ela não existe.
  - `saveSession` devolve `false` quando o update afeta 0 linhas.
  - `maskPhone('5513999991234')` dá `'***1234'`.
  - `notifyOps` sem Telegram usa WhatsApp; com `fetch` lançando erro, não propaga.
  - `parseOrigin('Oi! #AB12cd')` dá `'ab12cd'`; `parseOrigin('oi')` dá `'direto'`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `npx vitest run src/lib/reception/crm.test.ts src/lib/reception/ops.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar e documentar `TELEGRAM_BOT_TOKEN` e `TELEGRAM_OPS_CHAT_ID` no `.env.local.example`**

- [ ] **Step 4: Rodar e ver passar**

  Run: os mesmos 2 testes.
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(recepcao): deal, tag, pausa, notas e avisos ao João`

---

### Task 8: Orquestrador `runReception`

**Files:**
- Create: `src/lib/reception/run.ts`
- Test: `src/lib/reception/run.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 2–7 e `executeScheduleAppointment`
- Produces:
  - `interface ReceptionInput { accountId; userId; contactId; conversationId; senderName: string; senderPhone: string; text: string; settings: ReceptionSettings; now?: Date }`
  - `interface ReceptionDeps { db: SupabaseClient; classify: Classify; phrase: Phrase; loadDay: (dateStr: string) => Promise<AvailableSlot[]>; schedule: typeof executeScheduleAppointment; sendWhatsApp: (n: string, t: string) => Promise<unknown> }`
  - `runReception(input: ReceptionInput, deps: ReceptionDeps): Promise<string|null>`: o texto a enviar, ou `null` para não responder
  - `buildReceptionDeps(db, accountId, now): ReceptionDeps`: monta as dependências reais (Laya via `LAYA_URL` com `timeoutMs 2500`, `maxAttempts 1`; Haiku via `arbitrateWithClaude`; `makePhrase`; `makeLoadDay`)

**Fluxo de `runReception`:**

1. **Sem sessão:**
   - `ensureDeal`, depois `createSession` com `origin = parseOrigin(text)`.
   - Lê só o pedido de humano. Se houve, segue como `handoff`.
   - Senão, responde `ask nicho`. A 1ª mensagem nunca conta como resposta nem como `unclear` (Review Focus 2).

2. **Com sessão:**
   - `readAnswer`. Se lançar erro (Laya e Haiku fora), devolve `COPY.ask[stage]`, ou `formatOffer` em `agendando`, sem mudar a sessão (Review Focus 4).
   - `advance`, depois `saveSession(next, prev.stage)`. Se der `false`, devolve `null` (Review Focus 1).

3. **Efeitos de cada ação:**

   | Ação | Efeitos |
   |---|---|
   | `offer_slots` | `pickOfferSlots(now, loadDay, skip = slots já oferecidos)`; salva `offeredSlots`; responde `formatOffer`. Sem slots ou com erro: `notifyOps` + `COPY.calendarFail`. |
   | `book` | `schedule({ datetimeIso: slot.iso, clientName: senderName, senderPhone, contactId, accountId, userId, conversationId, dealId, notes: resumo das answers, sendEvolutionMessage: sendWhatsApp })`; `moveDeal(agendado)`; grava `appointmentId`; `stage='concluida'`; `enqueueJob(lembrete, runAt = slot − 1h)`. Responde `replyMessage`. Se `meetCreated` for false, responde `COPY.meetPending` + `notifyOps` pedindo o link manual. |
   | `morno` | `moveDeal(morno)`; `enqueueJob(followup, now + 3 dias)`. |
   | `frio` | `moveDeal(curioso)` + `tagContact('curioso')`. |
   | `handoff` | `moveDeal(humano)`; `pauseAi(conversationId, resumo)`; `notifyOps('Lead ' + maskPhone(senderPhone) + ' pediu humano')`. |

4. **Outcome:** grava `outcome` e `score` na sessão sempre que `advance` os definir.

- [ ] **Step 1: Escrever os testes que falham**

  `deps` falsos e Supabase em memória (Map por tabela, com só os métodos usados):
  - 1ª mensagem "oi" → `COPY.ask.nicho` (ou o `phrase` mockado), sessão criada em `nicho`, `unclearCount` 0.
  - Caminho completo:
    - "dentista"
    - "tráfego e CRM"
    - "sim, faturo e tenho secretária"
    - "agora"
    - Resultado: oferta com 3 opções. Depois "2" chama `schedule` com o `iso` do 2º slot, cria o job `lembrete` 1h antes e move o deal para `agendado`.
  - Fluxo morno cria job `followup` em +3 dias.
  - Fluxo frio aplica a tag `curioso`.
  - `classify` lançando erro → resposta = `COPY.ask.interesse`, sessão sem mudar.
  - `saveSession` devolvendo `false` → `null`, e nenhum envio.
  - `schedule` com `meetCreated:false` → `COPY.meetPending` + `notifyOps` chamado.
  - Pedido de humano → `pauseAi` chamado; mensagem seguinte → `null`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `npx vitest run src/lib/reception/run.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar `runReception` e `buildReceptionDeps`**

- [ ] **Step 4: Rodar e ver passar**

  Run: `npx vitest run src/lib/reception`
  Expected: PASS, todos.

- [ ] **Step 5: Commit**

  `feat(recepcao): orquestrador da recepcionista`

---

### Task 9: Áudio (Whisper) e ligação no webhook da Evolution

**Files:**
- Create: `src/lib/reception/audio.ts`
- Modify: `src/app/api/whatsapp/evolution-webhook/route.ts`
- Test: `src/lib/reception/audio.test.ts`, `src/app/api/whatsapp/evolution-webhook/route.reception.test.ts`

**Interfaces:**
- Produces:
  - `transcribeEvolutionAudio(messageKeyId: string, deps?: { fetchImpl? }): Promise<string|null>`
- Consumes: `loadSettings`, `runReception`, `buildReceptionDeps`, `maskPhone`

**Como `transcribeEvolutionAudio` funciona:**
1. Busca o áudio: `POST {EVOLUTION_URL}/chat/getBase64FromMediaMessage/{INSTANCE}` com header `apikey` e corpo `{ message: { key: { id } }, convertToMp4: false }`, que devolve `{ base64, mimetype }`. Confirme o formato na doc da Evolution v2 antes de codar.
2. Transcreve em multipart (`file`, `model`, `language=pt`):
   - com `GROQ_API_KEY`: `https://api.groq.com/openai/v1/audio/transcriptions`, modelo `whisper-large-v3-turbo`
   - senão, com `OPENAI_API_KEY`: `https://api.openai.com/v1/audio/transcriptions`, modelo `whisper-1`
3. Qualquer falha devolve `null`.

**Mudanças no `route.ts`:**
- **Áudio:** no filtro de conteúdo vazio, se houver `data.message.audioMessage`, transcreva. Com texto, siga com `messageText = transcrição` e grave a mensagem com `content_type: 'audio'`. Sem texto, responda `Não consegui ouvir o áudio, pode me mandar por escrito?`.
- **Log:** troque `[Nova Mensagem] ${senderName} (${senderNumber})` por `maskPhone(senderNumber)`.
- **Recepção:** logo depois do `isAiPaused`:
  - `const settings = await loadSettings(supabaseAdmin(), accountId)`.
  - Se `settings?.enabled && contact?.id && conversationId`, `replyText = await runReception({...}, buildReceptionDeps(...))`.
  - Senão, use o `generateClaudeReply` atual, sem mudar nada.
  - A presença humana, o envio, a gravação da mensagem do bot e o `last_message_*` continuam como estão para os dois caminhos.

- [ ] **Step 1: Escrever os testes que falham**

  - `audio.test.ts`:
    - Groq tem prioridade sobre OpenAI.
    - Erro da Evolution devolve `null`.
  - `route.reception.test.ts`:
    - Use `vi.mock` de `@/lib/reception/run` e `@/lib/reception/store` e Supabase mockado no estilo de `route.account.test.ts`.
    - Com `enabled: true`: `runReception` é chamado e `generateClaudeReply` não é. O teste espiona o `messages.create` do Anthropic, que não deve ser chamado.
    - Com `enabled: false`: caminho antigo.
    - Com `runReception` devolvendo `null`: nenhum `fetch` para `/message/sendText`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `npx vitest run src/lib/reception/audio.test.ts src/app/api/whatsapp/evolution-webhook`
  Expected: FAIL nos novos; `route.test.ts` e `route.account.test.ts` seguem passando.

- [ ] **Step 3: Implementar e documentar `GROQ_API_KEY` e `OPENAI_API_KEY` no `.env.local.example`**

- [ ] **Step 4: Rodar a suíte inteira e o typecheck**

  Run: `npm test && npm run typecheck && npm run lint`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(recepcao): webhook da Evolution usa a recepcionista e transcreve áudio`

---

### Task 10: Cron (lembretes, follow-ups, saúde da Evolution)

**Files:**
- Create: `src/lib/reception/jobs.ts`, `src/app/api/reception/cron/route.ts`
- Test: `src/lib/reception/jobs.test.ts`, `src/app/api/reception/cron/route.test.ts`

**Interfaces:**
- Produces:
  - `drainReceptionJobs(db, now: Date, deps: { send: (phone: string, text: string) => Promise<unknown>; notify: (t: string) => Promise<void> }): Promise<{ done: number; failed: number }>`
  - `checkEvolutionHealth(db, accountId, now: Date, deps: { fetchImpl?; notify }): Promise<'open'|'down'>`
  - `GET /api/reception/cron`

**`drainReceptionJobs`:**
- Pega até 20 jobs `pending` com `run_at <= now`, com claim condicional (`pending` → `running`), no mesmo padrão de `worker/queue.ts`.
- **`lembrete`:** só se o appointment ainda estiver `confirmed`. Envia `COPY.lembrete`, com hora `HHh` no fuso de SP, `meeting_url` e o 1º nome do contato.
- **`followup`:** só se a sessão ainda estiver `concluida`/`morno` e sem appointment.
  - Se a última mensagem `customer` da conversa tiver `created_at >= now − 24h`, envia `COPY.followup`.
  - Senão, cria nota "Follow-up de morno pendente: chamar pelo WhatsApp oficial ou e-mail" + `notify`, e marca o job `done`.
- **Falhas:** erro aumenta `attempts`. Com menos de 3, volta para `pending` com `run_at + 5 min`; com 3, `failed` + `notify`. Isso dá 2 retries e alerta na 3ª.

**`checkEvolutionHealth`:**
- `GET {EVOLUTION_URL}/instance/connectionState/{INSTANCE}` com `apikey`. `instance.state === 'open'` dá `'open'`.
- Se cair, só avisa (`notify`) se `last_health_alert_at` for null ou tiver mais de 1h; depois grava `now`.

**Rota:**
- Exige `x-cron-secret` igual a `AUTOMATION_CRON_SECRET`, com `timingSafeEqual` (copie o bloco de `src/app/api/automations/cron/route.ts`).
- Sem segredo configurado, responde 503.
- Roda as duas funções para `deploymentAccountScope()` e devolve JSON com os contadores.

- [ ] **Step 1: Escrever os testes que falham**

  - Lembrete de appointment `cancelled` não envia e marca `done`.
  - Follow-up com última mensagem há 3 dias: não envia, cria nota e avisa.
  - Follow-up com mensagem há 2h: envia.
  - Envio falhando 3× resulta em `failed` + `notify` uma vez.
  - Evolution `close` duas vezes em 10 min: `notify` só 1×.
  - Rota sem header: 401. Sem `AUTOMATION_CRON_SECRET`: 503.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `npx vitest run src/lib/reception/jobs.test.ts src/app/api/reception`
  Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar e ver passar**

  Run: os mesmos testes, mais `npm run typecheck`.
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(recepcao): cron de lembrete, follow-up e saúde da Evolution`

---

### Task 11: Avaliação da Laya, docs e E2E manual

**Files:**
- Create: `worker/scripts/eval-reception.ts`, `worker/scripts/reception-eval.json`, `docs/recepcionista.md`
- Modify: `package.json` (script `"reception:eval": "tsx --env-file=.env.local worker/scripts/eval-reception.ts"`)

**Interfaces:**
- Consumes: `makeClassify`, `readAnswer` (Task 2)

**Fixture (`reception-eval.json`):**
- 30 respostas sintéticas `{ stage, text }`, distribuídas 8 `interesse`, 8 `momento`, 8 `urgencia`, 6 de pedido de humano.
- Escritas à mão, sem nenhum dado real de lead.

**O que o script faz:**
1. Roda cada item 2 vezes:
   - só Laya (sem fallback)
   - só Haiku, que é o gabarito
2. Imprime o acerto por etapa e o total.
3. Sai com código 1 se o total for < 85%.

**`docs/recepcionista.md`:**
- Como ligar a recepcionista:
  1. Faça o `insert` em `reception_settings` com `pipeline_id`, `stage_ids` e `plans_url`. Crie antes o pipeline "Funil Concept" com os 5 estágios: Novo, Agendado, Morno, Curioso, Humano.
  2. Coloque `enabled = true`.
- Variáveis da Vercel:
  - `LAYA_URL` (URL do ngrok)
  - `LAYA_API_KEY`
  - Google OAuth
  - Telegram
  - Groq/OpenAI
- Pinger externo (cron-job.org) a cada 5 min em `GET /api/reception/cron` com o header `x-cron-secret`.
- Refresh token Google:
  1. Crie um OAuth Client no Google Cloud.
  2. No OAuth Playground, use o próprio client e o escopo `calendar.events`.
  3. Copie o refresh token para a Vercel.
- Como desligar: `enabled = false` volta o robô antigo na hora.

- [ ] **Step 1: Escrever o fixture e o script; rodar com a Laya e a chave do Haiku locais**

  Run: `npm run laya` (outro terminal) e `npm run reception:eval`
  Expected: tabela por etapa e total ≥ 85%.
  Se ficar abaixo, anote quais perguntas falham e ajuste o texto das `instructions` em `classify.ts`. Não baixe o limiar.

- [ ] **Step 2: Escrever `docs/recepcionista.md`**

- [ ] **Step 3: Verificação final**

  Run: `npm test && npm run typecheck && npm run lint && npm run build`
  Expected: tudo PASS.

- [ ] **Step 4: Commit**

  `docs(recepcao): avaliação da Laya e guia de ativação`

- [ ] **Step 5: E2E manual, numa conta de teste, com o João**

  1. Ligue `enabled` numa branch do Supabase + Preview da Vercel.
  2. Do celular de teste, mande "oi #teste1" e responda as 4 perguntas como lead quente.
  3. Escolha o horário "1".
  4. Confira:
     - evento no Google Calendar com link `meet.google.com/xxx-xxxx-xxx`
     - deal em "Agendado"
     - `reception_sessions.origin = 'teste1'`
     - job `lembrete` criado
     - aviso no Telegram
  5. Repita como lead morno e como pedido de humano. No humano, a IA pausa e o aviso chega.

---

## Pré-requisitos do João para a Fase 1

- **Google OAuth:** um OAuth Client no Google Cloud, com a API do Calendar ativa, e o refresh token da conta que recebe as reuniões. A branch `fix/calendar-auth` só exige login nas rotas `/api/calendar/*` e não resolve isso.
- **Bot do Telegram:** o mesmo do Hermes, com o `chat_id` de operações.
- **Laya exposta:** ngrok com URL fixa, para colocar em `LAYA_URL` na Vercel.
- **Pinger de 5 min:** em `/api/reception/cron`.
- **`plans_url`:** a página de planos, mesmo provisória, até o sub-projeto 2.
