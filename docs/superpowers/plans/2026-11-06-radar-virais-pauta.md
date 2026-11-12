# Radar de virais e pauta guiada: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O João ou o Léo mandam links de vídeos virais; o worker baixa, o Gemini explica por que viralizou, o Haiku resume num playbook semanal e a pauta da semana sai inspirada nessas referências, incluindo o formato carrossel.

**Architecture:** Tabela nova `marketing_references` processada como fila pelo worker do Mac (mesmo padrão de `marketing_videos`). Regras puras em `src/lib/marketing/` (`references.ts`, `playbook.ts`, `pauta.ts`), efeitos no worker com dependências injetadas. Carrossel não usa vídeo: o post nasce com `frames` (uma lâmina cada) e a publicação desenha uma arte por lâmina.

**Tech Stack:** Next.js (ler `node_modules/next/dist/docs/` antes de criar rota, ver `AGENTS.md`), Supabase, Vitest, `@google/genai` 2.x, `@anthropic-ai/sdk`, `yt-dlp` + `ffmpeg` no Mac, Satori (`next/og`) para arte.

**Spec:** `docs/superpowers/specs/2026-11-06-radar-virais-pauta-design.md`

## Global Constraints

- Hosts aceitos: `instagram.com/reel/`, `instagram.com/reels/`, `instagram.com/p/` (com ou sem `www.`), `tiktok.com`, `www.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`, `m.tiktok.com`. Só `https`.
- Vídeo acima de **180 s** é recusado antes da análise.
- Análise: `porQueViralizou` com **exatamente 3** itens de até 140 caracteres; `tema` até 80; `promessa` e `entrega` até 140; `cta` até 100; `comoAdaptar` até 280; `inspiracao` do item da pauta até 140.
- Playbook: no máximo **20** referências dos últimos **30 dias**; `comoFalar` e `sobreOQue` até 5 itens cada; `evitar` até 3.
- Carrossel: de **3 a 7** lâminas (uma por linha do roteiro).
- Gemini 429: `retry_after = now + 1 h`, volta para `pending`.
- Upload manual: só `video/*`, até **100 MB**, no bucket `marketing`, caminho `account-<id>/referencias/<referenceId>.<ext>`; apagado depois da análise.
- Vídeo de terceiro nunca fica guardado. Pasta temporária apagada em `finally`.
- Nada é publicado sem aprovação (a pauta continua passando pelo João/Léo).
- Modelo de texto do playbook: `HAIKU_MODEL` (`worker/video-models.ts`). Modelo de vídeo: env `GEMINI_VIDEO_MODEL`, padrão **`gemini-3.5-flash`** (Task 1, 2026-11-06: vídeo + áudio aceitos; `files.upload` → `files.get` até `ACTIVE` (~6 s) → `models.generateContent` com `responseMimeType: 'application/json'` → `files.delete`). Usar `responseSchema` (o flash-lite devolveu o JSON dentro de um array) e **timeout de 120 s** por chamada (o 3.8-flash travou >180 s). Cota gratuita não confirmada pela API: o João confere no AI Studio.
- Status da fila seguem `worker/queue.ts`: `pending | running | done | failed` (na tela: Na fila, Analisando, Pronto, Erro).
- Migração `061_marketing_references.sql` (a 059 e a 060 são da Loja); conferir o próximo número livre no merge.

## Review Focus

1. **Link de compartilhamento do Instagram** (`/reels/ID/?igsh=…`, barra final, `www.` ausente) deve virar o mesmo `normalized` que `/reel/ID`, senão o mesmo vídeo é analisado duas vezes. Teste na Task 3.
2. **Worker cai no meio da análise** (Mac dorme): a linha fica `running` e precisa voltar à fila na inicialização. Teste na Task 5 (`requeueOrphaned` aceita `marketing_references`).
3. **Texto do vídeo tentando mandar na IA** ("ignore as regras…" na legenda): a pauta precisa receber a análise cortada nos limites e dentro do bloco delimitado. Teste na Task 9.
4. **Referência apagada com item da pauta ainda aberto**: `referencia_id` vira `null` e a API v1 devolve o item sem quebrar. Teste na Task 9.
5. **Arquivo enviado grande demais ou que não é vídeo**: a rota recusa com 400 antes do upload. Teste na Task 4.

---

### Task 1: Verificar o Gemini para vídeo no plano gratuito (bloqueante, sem commit)

**Files:** nenhum no repositório. Script descartável em pasta temporária fora do repo.

- [ ] **Step 1:** `npm install` na worktree.
- [ ] **Step 2:** No AI Studio, anotar a cota gratuita da chave `GEMINI_API_KEY` do `.env.local` para os modelos Flash que aceitam vídeo (pedidos por dia e por minuto).
- [ ] **Step 3:** Script descartável: `files.upload` de um MP4 público curto + `models.generateContent` com `responseMimeType: 'application/json'`, conferindo nos tipos de `node_modules/@google/genai` os nomes exatos dessas chamadas e como esperar o arquivo ficar `ACTIVE`.
- [ ] **Step 4:** Registrar no topo deste plano (seção Global Constraints) o modelo escolhido como padrão de `GEMINI_VIDEO_MODEL` e a cota diária. **Se o plano gratuito não aceitar vídeo, parar e avisar o João** (a decisão de custo zero muda).

### Task 2: Migração 061 e tipos

**Files:**
- Create: `supabase/migrations/061_marketing_references.sql`
- Modify: `src/types/index.ts` (perto de `MarketingPautaItem`, linha ~886)
- Modify: `worker/queue.ts` (`JobTable`)

**Interfaces:**
- Produces: tabela `marketing_references`; tipos `MarketingReference`, `ReferencePlatform`, `ReferenceEixo`, `ReferenceStatus`; `PautaFormato` com `'carrossel'`; `MarketingPauta.playbook: Playbook | null`; `MarketingPautaItem.referencia_id: string | null`, `inspiracao: string | null`; `JobTable` com `'marketing_references'`.

- [ ] **Step 1: Escrever a migração.** Colunas como na spec, com estas trocas para caber na fila: `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed'))`, `error TEXT`, `started_at TIMESTAMPTZ`, `finished_at TIMESTAMPTZ`, `retry_after TIMESTAMPTZ`. `UNIQUE (account_id, url_normalizada)`, índice `(account_id, status, created_at)`, RLS copiando o bloco `DO $$ … $$` da 057 com o array `ARRAY['marketing_references']`. `ALTER TABLE marketing_pautas ADD COLUMN playbook JSONB`; `ALTER TABLE marketing_pauta_itens ADD COLUMN referencia_id UUID REFERENCES marketing_references(id) ON DELETE SET NULL, ADD COLUMN inspiracao TEXT`; trocar a CHECK de `formato` (drop pelo nome gerado `marketing_pauta_itens_formato_check`, recriar com `'carrossel'`). Tudo idempotente (`IF NOT EXISTS`, `DROP … IF EXISTS`).
- [ ] **Step 2: Tipos.** `MarketingReference` espelha a tabela (`analise: ReferenceAnalysis | null`, importando o tipo da Task 3 por `import type`). `Playbook` vem da Task 7; até lá declarar em `src/types/index.ts` e reexportar de `playbook.ts` (fonte única nos tipos).
- [ ] **Step 3:** `JobTable` ganha `'marketing_references'`.
- [ ] **Step 4:** `npm run typecheck` → sem erros.
- [ ] **Step 5:** Aplicar a migração num banco **não produção** (branch do Supabase ou local) e conferir `\d marketing_references`. Produção só com OK do João.
- [ ] **Step 6: Commit** `feat(marketing): tabela de referências virais (migration 061)`.

### Task 3: Regras puras das referências

**Files:**
- Create: `src/lib/marketing/references.ts`
- Test: `src/lib/marketing/references.test.ts`

**Interfaces:**
- Produces:
  - `normalizeReferenceUrl(raw: string): { url: string; normalized: string; platform: ReferencePlatform } | null`
  - `validateReferenceInput(body: unknown): { ok: true; value: { url: string; normalized: string; platform: ReferencePlatform; eixo: ReferenceEixo; nicho: BusinessNiche | null; views: number | null } } | { ok: false; error: string }`
  - `interface ReferenceAnalysis` (formato da spec, com `gancho.tipo: 'curiosidade' | 'dor' | 'prova' | 'conflito'` e `formato: 'pessoa_falando' | 'tela' | 'texto_animado' | 'bastidor' | 'misto'`)
  - `parseReferenceAnalysis(raw: string): ReferenceAnalysis | null`
  - `referenceAnalysisPrompt(input: { eixo: ReferenceEixo; nicho: BusinessNiche | null; businessName: string }): string`
  - `REFERENCE_MAX_SECONDS = 180`, `REFERENCE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024`

- [ ] **Step 1: Testes que falham.**
  - `normalizeReferenceUrl('https://www.instagram.com/reels/ABC123/?igsh=xyz')` e `('https://instagram.com/reel/ABC123')` → mesmo `normalized` `https://www.instagram.com/reel/ABC123`, `platform: 'instagram'`.
  - `/p/XYZ/` aceito; `https://instagram.com/conceptdigita.l` → `null`; `http://` → `null`; `https://evil.com/reel/x` → `null`; `https://instagram.com.evil.com/reel/x` → `null`; `https://169.254.169.254/` → `null`.
  - TikTok: `https://www.tiktok.com/@user/video/123?is_from_webapp=1` → `normalized` sem query; `https://vm.tiktok.com/ZM123/` aceito.
  - `validateReferenceInput`: eixo inválido → erro; `sobre_o_que` sem nicho → erro; `como_falar` com nicho → nicho ignorado (`null`); `views` negativo ou não inteiro → erro.
  - `parseReferenceAnalysis`: JSON válido → objeto; `porQueViralizou` com 2 itens → `null`; com 4 → `null`; `gancho.tipo: 'humor'` → `null`; `tema` de 200 caracteres → cortado em 80; texto antes e depois do JSON → ainda lê o objeto.
  - `referenceAnalysisPrompt` contém os nomes de todas as chaves de `ReferenceAnalysis` e o nome do negócio.
- [ ] **Step 2:** `npx vitest run src/lib/marketing/references.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar.** `URL` nativo; host comparado por igualdade exata com a lista; `/reels/` vira `/reel/`; sem query nem hash nem barra final. Reaproveitar o padrão `parseObject`/`txt` de `pauta.ts` (extrair os dois para um `src/lib/marketing/json-text.ts` e importar nos dois arquivos).
- [ ] **Step 4:** Rodar o teste → PASS; `npx vitest run src/lib/marketing/pauta.test.ts` → continua PASS.
- [ ] **Step 5: Commit** `feat(marketing): validação de links e análise de referências`.

### Task 4: Rotas do CRM para referências

**Files:**
- Create: `src/app/api/marketing/references/route.ts` (GET lista, POST link)
- Create: `src/app/api/marketing/references/upload/route.ts` (POST multipart: arquivo + eixo + nicho)
- Create: `src/app/api/marketing/references/[id]/retry/route.ts` (POST)
- Test: `src/app/api/marketing/references/references.test.ts` (seguir o estilo de `src/app/api/v1/marketing/pautas/pautas.test.ts` para mockar auth e Supabase)

**Interfaces:**
- Consumes: `validateReferenceInput`, `REFERENCE_UPLOAD_MAX_BYTES` (Task 3); `requireRole` de `@/lib/auth/account`.
- Produces: `GET → { references: MarketingReference[]; playbook: Playbook | null }` (as 50 mais recentes + o `playbook` da pauta da semana atual); `POST → 201 { reference }` ou `200 { reference, duplicate: true }`; `retry → 200 { reference }` (só de `failed`: volta a `pending`, zera `error` e `retry_after`).

- [ ] **Step 1: Testes que falham.** POST link válido → 201 com `status: 'pending'`; link repetido (erro `23505` no insert) → 200 com a referência existente e `duplicate: true`; host fora da lista → 400; papel `viewer` no POST → 403; upload `image/png` → 400; upload acima de 100 MB → 400 **sem** chamar o Storage; upload válido grava `arquivo_path` e `url`/`url_normalizada` como `upload:<referenceId>` com `platform` informada no form; retry em `done` → 409.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar.** `requireRole('viewer')` no GET, `requireRole('agent')` nos POST. No upload, gerar o id com `crypto.randomUUID()` antes de enviar o arquivo e inserir a linha com esse id; se o insert falhar, apagar o arquivo. Upload com o cliente admin (service role) depois de conferir a conta, como em `post-art-store.ts`.
- [ ] **Step 4:** Rodar → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(marketing): rotas de referências (link, upload, analisar de novo)`.

### Task 5: Worker de análise

**Files:**
- Create: `worker/references.ts`
- Test: `worker/references.test.ts`
- Modify: `worker/index.ts` (novo passo no `tick`, depois dos vídeos e antes da pauta; `requeueOrphaned(db, 'marketing_references')` no `main`)

**Interfaces:**
- Consumes: `parseReferenceAnalysis`, `referenceAnalysisPrompt`, `REFERENCE_MAX_SECONDS` (Task 3); `finishJob`, `failJob` de `worker/queue.ts`.
- Produces:
  - `interface ReferenceDeps { now(): Date; probeDuration(url: string): Promise<number>; download(url: string, dir: string): Promise<string>; downloadUpload(path: string, dir: string): Promise<string>; removeUpload(path: string): Promise<void>; analyze(videoPath: string, prompt: string): Promise<string> }`
  - `class GeminiQuotaError extends Error`
  - `claimNextReference(db, accountIds: string[], now: Date): Promise<MarketingReference | null>` (como `claimNext`, mais o filtro `retry_after is null or retry_after <= now`)
  - `runReferenceTick(db, accountIds: string[], deps: ReferenceDeps): Promise<boolean>`

- [ ] **Step 1: Testes que falham** (Supabase falso no estilo de `worker/pauta.test.ts`; deps falsas):
  - Caminho feliz: `done`, `analise` gravada, `download` chamado com uma pasta e essa pasta não existe mais depois.
  - `probeDuration` → 200 → `failed` com `error` "vídeo longo demais", `download` nunca chamado.
  - `download` lança → `failed` com "envie o arquivo do vídeo".
  - `analyze` lança `GeminiQuotaError` → `pending` com `retry_after` = now + 1 h; e `claimNextReference` com `now` 30 min depois → `null`; 61 min depois → a linha.
  - `analyze` devolve JSON inválido duas vezes → `failed` "análise falhou"; inválido e depois válido → `done` (exatamente 2 chamadas).
  - Upload: usa `downloadUpload`, e `removeUpload` é chamado e `arquivo_path` zerado tanto no `done` quanto no `failed`.
  - Pasta temporária apagada quando `analyze` lança erro genérico.
  - `requeueOrphaned(db, 'marketing_references')` devolve linha `running` para `pending`.
- [ ] **Step 2:** `npx vitest run worker/references.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `runReferenceTick`: claim → (upload ? `downloadUpload` : `probeDuration` + `download`) → `analyze` (até 2 tentativas de parse) → `finishJob(…, { analise })`. `mkdtemp` + `rm` em `finally`. O nome do negócio vem de `marketing_settings.business_name` (padrão "Concept Digital").
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** `feat(worker): análise de referências virais com fila e nova tentativa`.

### Task 6: Dependências reais (yt-dlp, Gemini, Storage)

**Files:**
- Create: `worker/reference-deps.ts`
- Test: `worker/reference-deps.test.ts` (só a parte pura)

**Interfaces:**
- Consumes: `ReferenceDeps`, `GeminiQuotaError` (Task 5); `runCommand` de `worker/exec.ts`.
- Produces: `makeReferenceDeps(db: SupabaseClient): ReferenceDeps`; `parseYtDlpDuration(json: string): number`; `isQuotaError(err: unknown): boolean`.

- [ ] **Step 1: Testes que falham.** `parseYtDlpDuration('{"duration": 42.5}')` → 42.5; sem `duration` → lança; `isQuotaError` → `true` para erro com `status: 429` ou mensagem com `RESOURCE_EXHAUSTED`, `false` para 500.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar.** `probeDuration`: `yt-dlp --dump-json --no-playlist <url>` (timeout 60 s). `download`: `yt-dlp -f "mp4/best[height<=720]" --no-playlist -o <dir>/video.%(ext)s <url>` (timeout 3 min), devolve o caminho do arquivo. `analyze`: chamadas confirmadas na Task 1, modelo `process.env.GEMINI_VIDEO_MODEL || <padrão da Task 1>`, `responseMimeType: 'application/json'`; apagar o arquivo remoto do Gemini depois; 429 vira `GeminiQuotaError`. `downloadUpload`/`removeUpload`: bucket `marketing`.
- [ ] **Step 4:** Rodar → PASS. Ligar `makeReferenceDeps(db)` no `worker/index.ts`.
- [ ] **Step 5: Teste manual:** inserir 1 link público do TikTok pela rota da Task 4, rodar o worker e conferir `done` com análise coerente.
- [ ] **Step 6: Commit** `feat(worker): yt-dlp e Gemini para analisar referências`.

### Task 7: Aba Referências

**Files:**
- Create: `src/components/marketing/references-tab.tsx`
- Modify: `src/components/marketing/marketing-tabs-header.tsx` (`MarketingSubtab` ganha `'references'`, rótulo "Referências")
- Modify: `src/components/marketing/marketing-subtabs-page.tsx` (renderiza a aba)

**Interfaces:**
- Consumes: rotas da Task 4; `BUSINESS_NICHES` de `niche-autopilot.ts`; `Playbook` (tipos).

- [ ] **Step 1: Implementar a aba:** formulário (link, eixo, nicho só quando `sobre_o_que`, views opcional), botão "Enviar arquivo", lista com status em português e, quando `done`, tema + os 3 motivos + "como adaptar"; botão "Analisar de novo" em `failed`; bloco "Tendências da semana" com o `playbook` (some quando `null`). Atualiza a lista a cada 10 s enquanto houver `pending`/`running`.
- [ ] **Step 2:** `npm run typecheck && npm run lint` sem erro novo.
- [ ] **Step 3: Verificar no navegador** (dev server, viewport de celular e desktop): enviar um link, ver "Na fila" → "Pronto".
- [ ] **Step 4: Commit** `feat(marketing): aba Referências`.

### Task 8: Playbook da semana

**Files:**
- Create: `src/lib/marketing/playbook.ts`
- Test: `src/lib/marketing/playbook.test.ts`
- Modify: `worker/pauta.ts` (`gerarPauta`)
- Modify: `worker/pauta.test.ts`

**Interfaces:**
- Consumes: `ReferenceAnalysis` (Task 3).
- Produces:
  - `type PlaybookRef = { id: string; url: string; eixo: ReferenceEixo; nicho: BusinessNiche | null; analise: ReferenceAnalysis }`
  - `PLAYBOOK_SYSTEM: string`, `playbookPrompt(refs: PlaybookRef[]): string`, `parsePlaybook(raw: string): Playbook | null`
  - `carregarReferencias(db, accountId: string, now: Date): Promise<PlaybookRef[]>` exportada de `worker/pauta.ts` (`done`, `finished_at` nos últimos 30 dias, as 20 mais recentes).

- [ ] **Step 1: Testes que falham.** `parsePlaybook`: 7 itens em `comoFalar` → 5; `evitar` com 4 → 3; faltando `sobreOQue` → `[]`; JSON quebrado → `null`. `playbookPrompt` separa os dois eixos e cita cada referência pelo tema. Em `worker/pauta.test.ts`: com 2 referências, `generateText` é chamado primeiro com `PLAYBOOK_SYSTEM` e a pauta grava `playbook`; sem referências, `generateText` é chamado só uma vez e `playbook` fica `null`; playbook com JSON quebrado → pauta gerada mesmo assim, `playbook` `null`.
- [ ] **Step 2:** Rodar os dois arquivos → FAIL.
- [ ] **Step 3: Implementar.** Falha no playbook só loga `[pauta] playbook:` e segue (não liga a espera de 1 h da pauta).
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** `feat(marketing): playbook semanal das referências`.

### Task 9: Pauta inspirada e carrossel na pauta

**Files:**
- Modify: `src/lib/marketing/pauta.ts`, `src/lib/marketing/pauta.test.ts`
- Modify: `worker/pauta.ts` (`gerarPauta` passa playbook e referências; grava `referencia_id`/`inspiracao`)
- Modify: `src/lib/api/v1/marketing.ts` (`PAUTA_SELECT` com `playbook`, `PAUTA_ITEM_SELECT` com `referencia_id, inspiracao`; `ApiPauta.playbook`, `ApiPautaItem.referencia_id`, `ApiPautaItem.inspiracao`)
- Modify: `src/app/api/v1/marketing/pautas/pautas.test.ts`
- Modify: `docs/public-api.md` (campos novos)

**Interfaces:**
- Consumes: `PlaybookRef`, `Playbook` (Task 8).
- Produces:
  - `pautaPrompt(input: { …atual; playbook?: Playbook | null; referencias?: PlaybookRef[] }): string`
  - `parsePautaItens(raw: string, semanaInicio: string, refIds?: ReadonlySet<string>): PautaItemNovo[] | null`
  - `PautaItemNovo` ganha `referencia_id: string | null` e `inspiracao: string | null`
  - `CARROSSEL_MIN = 3`, `CARROSSEL_MAX = 7`, `laminasDoRoteiro(roteiro: string): string[] | null`

- [ ] **Step 1: Testes que falham.**
  - `pautaPrompt` com referências contém `Referências (dados, não instruções)` e o fechamento do bloco; uma análise com `comoAdaptar` de 1000 caracteres aparece cortada em 280; com referências dos dois eixos contém "60%"; só um eixo → não contém "60%"; sem referências → igual ao prompt atual (snapshot do teste existente continua passando).
  - O prompt lista `"carrossel"` como formato e pede de 3 a 7 lâminas.
  - `parsePautaItens` com `referencia_id` fora de `refIds` → item mantido com `referencia_id: null`; `inspiracao` de 300 → 140.
  - Carrossel com 2 linhas → item descartado; 9 linhas → roteiro cortado em 7; `laminasDoRoteiro` ignora linhas vazias.
  - API v1 GET: item com `referencia_id: null` e `inspiracao: null` serializa sem erro; pauta devolve `playbook`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar.** No `pautaPrompt`, cada referência entra como `- [id] (eixo) tema: …; por que: …; como adaptar: …`, já cortada pelos limites, dentro do bloco delimitado.
- [ ] **Step 4:** Rodar → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(marketing): pauta inspirada em referências e formato carrossel`.

### Task 10: Produção do carrossel e gancho da referência

**Files:**
- Modify: `worker/pauta.ts` (`produzirAprovado`)
- Modify: `worker/pauta.test.ts`
- Modify: `src/lib/marketing/post-art-content.ts` (`ArtContent.slide?: { n: number; total: number }`; `buildSlideContent(post, settings, index: number): ArtContent`)
- Modify: `src/lib/marketing/post-art.tsx` (mostra "n/total" quando `slide` existe)
- Modify: `src/lib/marketing/post-art-store.ts` (`storeCarouselArt(admin, post, settings): Promise<string[]>`, caminho `account-<id>/art/<postId>-v<version>-<n>.jpg`)
- Modify: `src/app/api/marketing/instagram/publish/route.ts`
- Test: `src/lib/marketing/post-art-content.test.ts`

**Interfaces:**
- Consumes: `laminasDoRoteiro` (Task 9).

- [ ] **Step 1: Testes que falham.**
  - `produzirAprovado` com item `carrossel`: cria `marketing_posts` com `media_type: 'carrossel'`, `kind: 'feed'`, `frames` = lâminas (`interaction: 'nenhuma'`), `status: 'pending_approval'`, `video_id: null`; **não** insere em `marketing_videos`; marca `produzido_em`.
  - Item `reel` com `referencia_id` cuja análise existe: o `prompt` do vídeo contém `Gancho de referência:` com o tipo e o primeiro quadro; sem referência → `prompt` igual ao de hoje.
  - `buildSlideContent(post, settings, 0)` com 4 frames → `headline` = texto da lâmina 1, `slide: { n: 1, total: 4 }`; última lâmina leva o CTA.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar.** Na publicação: `mediaType === 'carrossel'` sem mídia e com `frames.length >= 2` → `mediaUrls = await storeCarouselArt(...)`; o ramo atual (uma arte) continua para `foto`.
- [ ] **Step 4:** Rodar → PASS. Gerar localmente um carrossel de 4 lâminas e abrir os JPEGs para conferir o "n/total" e a leitura.
- [ ] **Step 5: Commit** `feat(marketing): carrossel da pauta com arte por lâmina`.

### Task 11: API v1 de referências

**Files:**
- Modify: `src/lib/api-keys/scopes.ts` (`'marketing:references'`, descrição "Send viral references for analysis and read their results (internal accounts only)")
- Create: `src/app/api/v1/marketing/references/route.ts` (GET `?status=`, POST)
- Modify: `src/app/api/v1/new-scopes.test.ts`
- Create: `src/app/api/v1/marketing/references/references.test.ts`
- Modify: `docs/public-api.md`

**Interfaces:**
- Consumes: `validateReferenceInput` (Task 3); `requireApiKey`, `assertInternalAccount`, `ok`, `fail`.

- [ ] **Step 1: Testes que falham.** Chave sem o escopo → 403; conta não interna → 403; POST válido → 201; repetido → 200 `duplicate: true`; `?status=xyz` → 400; GET devolve `analise` só quando `done`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** no molde de `src/app/api/v1/marketing/pautas/route.ts`.
- [ ] **Step 4:** Rodar → PASS; `npm test` inteiro → PASS.
- [ ] **Step 5: Commit** `feat(api): v1 de referências com escopo marketing:references`.

### Task 12: Ferramenta no Hermes (repositório `agente-pessoal`)

**Files:** `PersonalBrain/automacoes/agente-pessoal/crm_client.py`, `bot.py`, `testes/teste_crm.py`

- [ ] **Step 1: Teste que falha** em `testes/teste_crm.py` (CRM falso): `crm_referencia(url, eixo, nicho)` faz `POST /api/v1/marketing/references` e devolve o status; resposta `duplicate: true` vira "já estava na fila".
- [ ] **Step 2:** Implementar no molde das ferramentas `crm_*` existentes e ligar em `TOOLS`. Executa direto (sem botão).
- [ ] **Step 3:** Rodar `python3 testes/teste_crm.py` → tudo OK.
- [ ] **Step 4: Commit no `agente-pessoal`.** Depois do deploy do CRM: criar chave nova com `marketing:references` + os escopos atuais, trocar no `.env` do Hermes, revogar a antiga, reiniciar o bot (pedir OK ao João: é segredo e reinício).

### Task 13: Teste real

- [ ] **Step 1:** Com a migração aplicada no banco de teste: 2 links do Instagram e 1 do TikTok pela aba Referências.
- [ ] **Step 2:** Conferir as 3 análises (motivos fazem sentido com o vídeo).
- [ ] **Step 3:** Pedir uma pauta de teste (`POST /api/v1/marketing/pautas` na conta interna de teste) e conferir `playbook`, `inspiracao` e pelo menos um item com `referencia_id`.
- [ ] **Step 4:** Anotar o resultado no PR. Migração em produção e merge só com OK do João.
