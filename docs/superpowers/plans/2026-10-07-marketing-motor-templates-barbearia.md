# Motor de templates + pacote Barbearia (sub-projeto 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a geração livre de vídeo (Claude escrevendo o HTML) por templates HyperFrames fixos preenchidos por um "diretor" que só devolve dados, entregando o pacote Barbearia (3 botões) em 9:16 e 1:1.

**Architecture:** O CRM enfileira uma linha por formato em `marketing_videos` com `kind='reels'`, `niche` e `template_id`. O worker (Mac) baixa as fotos, checa a qualidade, pede ao diretor um JSON validado contra o `template.json`, preenche a composição HTML por substituição determinística, roda `hyperframes check` e `render`. O caminho antigo (texto livre, sem `template_id`) continua intacto.

**Tech Stack:** Next.js (versão com breaking changes: ler `node_modules/next/dist/docs/` antes de mexer em rotas/páginas), Supabase, vitest, `@anthropic-ai/sdk`, `hyperframes` ^0.8.90, `sharp` (já instalado).

**Spec:** `docs/superpowers/specs/2026-10-07-marketing-video-pacotes-de-nicho-design.md`

## Global Constraints

- Reels: formatos `9:16` (`format='vertical'`) e `1:1` (`format='square'`); Resumo: só `16:9` (`landscape`). A coluna existente `format` faz o papel do `aspect` do spec.
- `kind='resumo'` ⇒ `format='landscape'`; `kind='reels'` ⇒ `format IN ('vertical','square')` (constraint no banco e função no TS).
- Diretor devolve só dados; **nunca HTML/CSS**. Saída fora do schema ⇒ 1 nova tentativa com a lista de erros; falhou de novo ⇒ pedido `failed`, nada publicado.
- Checagem de fotos (resolução + escura/borrada) **antes** do render; mensagens em português simples, sem código de erro.
- Fotos exibidas como enviadas (recorte e movimento de câmera sim; geração/edição de conteúdo não).
- Pacote só visível quando o nicho ligado casa; outro nicho nunca aparece na UI **e é recusado na API**.
- Migrations só aditivas (CRMs derivados recebem por merge do `modelo`). Não aplicar em produção; aplicar só em banco de teste.
- Modelo do diretor: `VIDEO_MODEL` (padrão `claude-haiku-4-5-20251001`). Chave: `ANTHROPIC_API_KEY` do ambiente.
- Duração dos vídeos entre 15 e 25 s (brag-rules); vídeo mudo na v1.
- Textos na tela e mensagens em português do Brasil.

**Desvios conscientes do spec (aprovar na revisão):** (1) nicho vem da env `NEXT_PUBLIC_MARKETING_NICHE` por deploy e é copiado para `marketing_videos.niche` na hora de enfileirar, em vez de coluna em `accounts` (um admin da conta poderia alterá-la); (2) sem trilha de música na v1 (sem faixas licenciadas; campo `music` fora do `DirectorOutput`); (3) o teste de capa por pixel vira verificação de dimensões/duração por `ffprobe` + aprovação visual do João, pois comparação de pixel é frágil entre máquinas; (4) "Texto Livre" continua no caminho antigo até o sub-projeto 3; (5) pedido com dois formatos cria duas linhas (um render por linha).

## Review Focus

- Texto do dono com `<script>`, `&`, aspas ou emoji nos campos: sai escapado na composição, sem quebrar o HTML (Task 3).
- Texto maior que o limite do campo: recusado na entrada (400) e pelo schema do diretor, nunca estoura o layout (Tasks 2 e 11).
- Fotos fora da faixa do template, ou quantidade ímpar no Antes e depois: recusado com mensagem clara (Tasks 2 e 11).
- `buttonId`/`templateId` de outro nicho enviado direto à API: 400 (Task 11).
- Caminho de foto fora da pasta da conta ou com `..`: 400 (Task 11).
- Pedido com 2 formatos perto do limite diário (10): não ultrapassa o limite (Task 11).
- Um dos dois formatos falha no render: a outra linha segue independente (Task 10).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/048_marketing_video_packs.sql` | colunas novas + backfill + constraint |
| `src/lib/marketing/kinds.ts` | `VideoKind`, `isKindFormatValid` |
| `src/lib/marketing/packs/types.ts` | `TemplateSpec`, `DirectorOutput`, `Pack`, `PackButton`, `validateDirectorOutput` |
| `src/lib/marketing/packs/render.ts` | `planTimeline`, `renderComposition` (substituição determinística) |
| `src/lib/marketing/packs/index.ts` | `getPack`, `getActivePack`, `findButton` |
| `src/lib/marketing/packs/barbearia/` | `pack.ts` + `templates/{compilado,antes-depois,oferta}/{template.json,composition.html}` |
| `src/lib/marketing/photo-check.ts` | regras puras de resolução e mensagens |
| `worker/photo-vision.ts` | checagem escura/borrada com Claude visão (deps injetadas) |
| `worker/director.ts` | `runDirector` (deps injetadas, 1 retry) |
| `worker/video-template.ts` | `runTemplatedJob` |
| `src/lib/marketing/queue-templated.ts` + rota | enfileirar por botão |
| `src/components/marketing/pack-picker.tsx` + `page.tsx` | UI |

### Task 1: Migration e tipos

**Files:**
- Create: `supabase/migrations/048_marketing_video_packs.sql`, `src/lib/marketing/kinds.ts`, `src/lib/marketing/kinds.test.ts`
- Modify: `src/types/index.ts:769-784` (`MarketingVideo`)

**Interfaces:**
- Produces: `type VideoKind = 'reels' | 'resumo'`; `isKindFormatValid(kind: VideoKind, format: VideoFormat): boolean`; `MarketingVideo` ganha `kind: VideoKind`, `niche: string | null`, `template_id: string | null`, `director_input: Record<string, unknown> | null`, `director_output: Record<string, unknown> | null`, `caption: string | null`, `error_kind: 'photos' | 'director' | 'render' | null`.

- [ ] **Step 1: Teste falhando** em `kinds.test.ts`: `isKindFormatValid('reels','vertical')`, `('reels','square')` verdadeiros; `('reels','landscape')` falso; `('resumo','landscape')` verdadeiro; `('resumo','vertical')` falso.
- [ ] **Step 2:** `npx vitest run src/lib/marketing/kinds.test.ts` ⇒ FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `kinds.ts` e atualizar o tipo `MarketingVideo`.
- [ ] **Step 4: Escrever a migration**: `ADD COLUMN IF NOT EXISTS` para as 7 colunas (`kind` nasce nullable); backfill `UPDATE marketing_videos SET kind = CASE WHEN format='landscape' THEN 'resumo' ELSE 'reels' END WHERE kind IS NULL`; depois `SET NOT NULL`, `CHECK (kind IN ('reels','resumo'))`, `error_kind` com CHECK nos 3 valores, e `CONSTRAINT marketing_videos_kind_format CHECK ((kind='resumo' AND format='landscape') OR (kind='reels' AND format IN ('vertical','square')))`. Sem tocar em RLS.
- [ ] **Step 5:** `npx vitest run src/lib/marketing/kinds.test.ts` ⇒ PASS; `npm run typecheck` ⇒ sem erros novos.
- [ ] **Step 6:** Pedir ao João para aplicar a migration **em banco de teste** (não produção) e confirmar `select kind, format, count(*) from marketing_videos group by 1,2`. Registrar a confirmação antes de seguir para a Task 11.
- [ ] **Step 7: Commit** `feat(marketing): colunas de pacote/kind em marketing_videos`.

### Task 2: Contrato do template e validação do diretor

**Files:**
- Create: `src/lib/marketing/packs/types.ts`, `src/lib/marketing/packs/types.test.ts`

**Interfaces:**
- Produces:
  - `interface TemplateSpec { id: string; name: string; formats: Array<'vertical' | 'square'>; photos: { min: number; max: number; multipleOf?: number }; texts: Record<string, { maxChars: number; required?: boolean }>; }`
  - `interface DirectorOutput { templateId: string; photoOrder: number[]; texts: Record<string, string>; caption: string; hashtags: string[] }`
  - `validateDirectorOutput(spec: TemplateSpec, photoCount: number, out: unknown): { ok: true; value: DirectorOutput } | { ok: false; errors: string[] }`
  - `validateFieldLimits(spec: TemplateSpec, texts: Record<string, string>): string[]` (erros em português)

- [ ] **Step 1: Testes falhando** (spec de exemplo: fotos 4–10, `titulo` ≤ 40 obrigatório): aceita saída válida; recusa `templateId` diferente; recusa `photoOrder` que não é permutação de `0..photoCount-1`; recusa `photoCount` fora de 4–10; recusa `titulo` com 41 caracteres; recusa `titulo` ausente; com `multipleOf: 2`, recusa `photoCount` 5; recusa chave de texto fora do `texts` do spec; recusa `caption` vazia ou acima de 2200 caracteres; recusa mais de 15 `hashtags`.
- [ ] **Step 2:** rodar o arquivo ⇒ FAIL.
- [ ] **Step 3: Implementar** os tipos e as duas funções, sem dependência nova (checagem manual). Mensagens de erro em português (ex.: `"titulo passa de 40 caracteres"`).
- [ ] **Step 4:** rodar ⇒ PASS.
- [ ] **Step 5: Commit** `feat(marketing): contrato de template e validação do diretor`.

### Task 3: Linha do tempo e composição determinística

**Files:**
- Create: `src/lib/marketing/packs/render.ts`, `src/lib/marketing/packs/render.test.ts`

**Interfaces:**
- Consumes: `TemplateSpec` (Task 2).
- Produces:
  - `planTimeline(photoCount: number): { introSec: number; perPhotoSec: number; outroSec: number; totalSec: number }` com `introSec=2`, `outroSec=3`, `perPhotoSec = clamp((20 - 5) / photoCount, 1.2, 3.5)`.
  - `interface RenderData { width: number; height: number; texts: Record<string, string>; photos: string[]; timeline: ReturnType<typeof planTimeline> }`
  - `renderComposition(html: string, data: RenderData): string`

Sintaxe do template: `{{width}}`, `{{height}}`, `{{totalSec}}`, `{{introSec}}`, `{{outroSec}}`, `{{text.<chave>}}` (escapado para HTML), bloco `{{#photos}}…{{/photos}}` repetido por foto com `{{i}}` (1-based), `{{start}}`, `{{dur}}`, `{{src}}`. Placeholder desconhecido ⇒ lança erro.

- [ ] **Step 1: Testes falhando:** `planTimeline(4).totalSec` e `planTimeline(10).totalSec` ficam entre 15 e 25; `planTimeline(10).perPhotoSec` ≥ 1.2; mesma entrada ⇒ mesma saída (chamar duas vezes e comparar); `{{text.titulo}}` com `<script>alert(1)</script> & "x"` sai escapado; emoji e acentos preservados; bloco repete N vezes com `start` crescendo (`introSec + (i-1)*dur`); placeholder desconhecido lança erro.
- [ ] **Step 2:** rodar ⇒ FAIL.
- [ ] **Step 3: Implementar** com regex simples (sem biblioteca de template); escapar `& < > " '`.
- [ ] **Step 4:** rodar ⇒ PASS.
- [ ] **Step 5: Commit** `feat(marketing): linha do tempo e composição por substituição`.

### Task 4: Registro de pacotes e pacote Barbearia (metadados)

**Files:**
- Create: `src/lib/marketing/packs/index.ts`, `src/lib/marketing/packs/barbearia/pack.ts`, `src/lib/marketing/packs/barbearia/templates/{compilado,antes-depois,oferta}/template.json`, `src/lib/marketing/packs/index.test.ts`

**Interfaces:**
- Consumes: `TemplateSpec`.
- Produces:
  - `interface PackButton { id: string; label: string; description: string; templateId: string; formId: MarketingTemplateId; directorHint: string }`
  - `interface Pack { niche: string; name: string; tone: VideoTone; hashtags: string[]; buttons: PackButton[]; templates: TemplateSpec[] }`
  - `getPack(niche: string): Pack | null`; `getActivePack(raw?: string): Pack | null` (lê `process.env.NEXT_PUBLIC_MARKETING_NICHE` literal, como `internal-accounts.ts`); `findButton(pack: Pack, buttonId: string): { button: PackButton; spec: TemplateSpec } | null`

Valores da Barbearia (`niche: 'barbearia'`, `tone: 'polished'`): botões `compilado` ("Compilado de cortes", form `highlight`), `antes-depois` ("Antes e depois", form `highlight`), `oferta` ("Oferta da semana", form `discount`). Specs (todos `formats: ['vertical','square']`): `compilado` fotos 4–10, textos `titulo` ≤ 40 obrigatório, `subtitulo` ≤ 60, `cta` ≤ 40; `antes-depois` fotos 2–10 `multipleOf: 2` (pares antes/depois), textos `titulo` ≤ 40 obrigatório, `cta` ≤ 40; `oferta` fotos 1–6, textos `item` ≤ 40 e `price` ≤ 20 obrigatórios, `deadline` ≤ 40, `cta` ≤ 40.

- [ ] **Step 1: Testes falhando:** `getPack('barbearia')` existe e `getPack('imobiliaria')` é `null`; `getActivePack(undefined)` e `getActivePack('')` são `null`; `getActivePack('barbearia')` devolve o pacote; todo `button.templateId` existe em `pack.templates`; todo `button.formId` existe em `MARKETING_TEMPLATES` (`src/lib/marketing/templates.ts`); `findButton(pack,'inexistente')` é `null`.
- [ ] **Step 2:** rodar ⇒ FAIL.
- [ ] **Step 3: Implementar** (importar os `template.json`; `directorHint` com 1–2 frases de tom de barbearia em português, ex. foco em corte e acabamento, sem inventar preço).
- [ ] **Step 4:** rodar ⇒ PASS.
- [ ] **Step 5: Commit** `feat(marketing): registro de pacotes e metadados da Barbearia`.

### Tasks 5–7 (composições HTML dos três templates)

Uma task por template (um revisor pode reprovar um sem os outros). Cada uma tem a mesma forma; o conteúdo criativo é do implementador, guiado por `worker/prompts/hyperframes-core.md`, `hf-*.md`, `brag-rules.md` e pelo Concept Video como referência de acabamento.

### Task 5: Template `compilado`

**Files:**
- Create: `src/lib/marketing/packs/barbearia/templates/compilado/composition.html`, `src/lib/marketing/packs/barbearia/templates.test.ts`

**Interfaces:**
- Consumes: sintaxe de `renderComposition` (Task 3) e `template.json` do `compilado` (Task 4).

- [ ] **Step 1: Teste falhando** (`templates.test.ts`, parametrizado pelos 3 templates conforme forem criados): ler `composition.html`; assert que contém `{{#photos}}` e `{{/photos}}`; que usa `{{text.<chave>}}` para **toda** chave obrigatória do `template.json`; que não referencia script/fonte externa além do GSAP já usado no `example-blank.html`; que `renderComposition` com dados de exemplo (1080×1920 e 1080×1080, 4 e 10 fotos) não lança.
- [ ] **Step 2:** rodar ⇒ FAIL.
- [ ] **Step 3: Escrever `composition.html`:** gancho 2 s com `titulo` (≤ 2 s), uma cena por foto com movimento suave (zoom/pan), `subtitulo` e `cta` no final (outro 3 s); texto dentro das zonas seguras de 9:16 (evitar ~12% superior e ~20% inferior); layout responsivo a `{{width}}x{{height}}` (1:1 reorganiza o texto); timeline GSAP pausada e determinística conforme `hf-determinism-rules.md`.
- [ ] **Step 4:** teste ⇒ PASS. Rodar `hyperframes check` na composição renderizada com 4 fotos de exemplo (`node_modules/.bin/hyperframes check` no diretório temporário) ⇒ sem erros.
- [ ] **Step 5: Commit** `feat(marketing): template compilado da Barbearia`.

### Task 6: Template `antes-depois`

**Files:** Create: `.../templates/antes-depois/composition.html`

- [ ] **Step 1:** estender o teste parametrizado da Task 5 com este template (falha: arquivo inexistente).
- [ ] **Step 2: Escrever a composição:** cada par de fotos consecutivas (índices pares = antes, ímpares = depois) vira uma cena com revelação (corte/wipe) e rótulos "ANTES" e "DEPOIS"; `titulo` no gancho e `cta` no fim. Como o bloco `{{#photos}}` é por foto, usar `{{i}}` para decidir o rótulo por CSS (`:nth-child`) ou classe derivada; sem lógica nova no renderizador.
- [ ] **Step 3:** teste ⇒ PASS; `hyperframes check` com 2 e 10 fotos ⇒ sem erros.
- [ ] **Step 4: Commit** `feat(marketing): template antes-depois da Barbearia`.

### Task 7: Template `oferta`

**Files:** Create: `.../templates/oferta/composition.html`

- [ ] **Step 1:** estender o teste parametrizado (falha).
- [ ] **Step 2: Escrever a composição:** gancho com `item`, destaque grande de `price`, `deadline` quando preenchido (campo opcional: o bloco some sem sobrar espaço vazio), fotos de apoio, `cta` no final. Campo opcional vazio recebe string vazia no `RenderData`.
- [ ] **Step 3:** teste ⇒ PASS; `hyperframes check` com 1 e 6 fotos ⇒ sem erros.
- [ ] **Step 4: Commit** `feat(marketing): template oferta da Barbearia`.

### Task 8: Checagem de fotos

**Files:**
- Create: `src/lib/marketing/photo-check.ts`, `src/lib/marketing/photo-check.test.ts`, `worker/photo-vision.ts`, `worker/photo-vision.test.ts`

**Interfaces:**
- Produces:
  - `MIN_SHORT_SIDE = 720`
  - `checkResolution(dims: Array<{ width: number; height: number }>): string[]` (uma mensagem por foto pequena, ex. `"A foto 3 está pequena demais (mínimo 720 px no lado menor)"`)
  - `interface VisionDeps { classify(images: Buffer[]): Promise<Array<'ok' | 'escura' | 'borrada'>> }`
  - `checkPhotoQuality(deps: VisionDeps, files: Buffer[]): Promise<string[]>` (mensagens como `"A foto 2 está escura, quer trocar?"`; lista vazia = tudo certo). Reduz cada imagem com `sharp` (lado maior 1024, JPEG) antes de enviar; o `defaultVisionDeps` pede ao Claude um array JSON e valida a resposta.

- [ ] **Step 1: Testes falhando:** `checkResolution` aponta só as fotos com lado menor < 720 e numera a partir de 1; `checkPhotoQuality` com `classify` simulado devolvendo `['ok','escura','borrada']` gera 2 mensagens com os números certos; resposta do classificador com tamanho errado ⇒ erro (não aprova em silêncio).
- [ ] **Step 2:** rodar ⇒ FAIL.
- [ ] **Step 3: Implementar** (dimensões via `sharp(buf).metadata()`; modelo `VIDEO_MODEL`).
- [ ] **Step 4:** rodar ⇒ PASS.
- [ ] **Step 5: Commit** `feat(marketing): checagem de qualidade das fotos`.

### Task 9: Diretor

**Files:**
- Create: `worker/director.ts`, `worker/director.test.ts`

**Interfaces:**
- Consumes: `validateDirectorOutput`, `Pack`, `PackButton`, `TemplateSpec`.
- Produces:
  - `interface DirectorDeps { ask(system: string, user: string): Promise<string> }`
  - `interface DirectorInput { pack: Pack; button: PackButton; spec: TemplateSpec; fields: Record<string, string>; photoCount: number; businessName: string }`
  - `runDirector(deps: DirectorDeps, input: DirectorInput): Promise<DirectorOutput>`; lança `DirectorError` (mensagem em português) após a segunda falha.

- [ ] **Step 1: Testes falhando:** resposta válida em bloco ```json ⇒ devolve o objeto; resposta com texto de 41 caracteres no `titulo` ⇒ segunda chamada contém a lista de erros do validador, e a segunda resposta válida passa; duas respostas inválidas ⇒ lança `DirectorError`; resposta com HTML/`<style>` dentro de um texto ⇒ recusada (o diretor não pode devolver marcação); o prompt de sistema contém `button.directorHint`, os limites de cada texto e a instrução de não inventar preço, nome ou endereço fora de `fields`.
- [ ] **Step 2:** rodar ⇒ FAIL.
- [ ] **Step 3: Implementar** o prompt (português; saída: um bloco ```json com `templateId`, `photoOrder`, `texts`, `caption`, `hashtags`) e `defaultDirectorDeps` com `@anthropic-ai/sdk` e `VIDEO_MODEL`, seguindo o padrão de `defaultDeps.compose` em `worker/video.ts` (stream + tratamento de `refusal`/`max_tokens`).
- [ ] **Step 4:** rodar ⇒ PASS.
- [ ] **Step 5: Commit** `feat(marketing): diretor que devolve só dados`.

### Task 10: Job de render por template

**Files:**
- Create: `worker/video-template.ts`, `worker/video-template.test.ts`
- Modify: `worker/video.ts` (`runVideoJob`: se `video.template_id`, delega a `runTemplatedJob`), `worker/video.test.ts` (1 teste de despacho)

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 8, 9; `failJob`/`finishJob` de `worker/queue.ts` (estender `failJob` com parâmetro opcional `extra?: Record<string, unknown>` para gravar `error_kind`).
- Produces: `runTemplatedJob(db: SupabaseClient, video: MarketingVideo, overrides?: Partial<TemplatedDeps>): Promise<void>` onde `TemplatedDeps` agrega `VisionDeps`, `DirectorDeps` e as funções `check`, `render`, `poster`, `readFile` já usadas em `VideoDeps`.

Fluxo: validar caminhos das fotos (pasta da conta) → baixar para `assets/` → resolução e visão ⇒ se houver problemas, `failJob` com a mensagem e `error_kind='photos'` e **sem** render → `runDirector` ⇒ em `DirectorError`, `error_kind='director'` → reordenar fotos por `photoOrder` → `renderComposition` (dimensões de `FORMAT_SIZE`) → `check` → `render` → `poster` → upload no bucket `marketing` com os mesmos caminhos de hoje → `finishJob` com `video_path`, `poster_path`, `director_output` e `caption`.

- [ ] **Step 1: Testes falhando** (com `fakeDb`/`deps` no estilo de `video.test.ts`): caminho feliz grava `done`, `caption` e `director_output`; foto escura ⇒ `failed` com `error_kind='photos'`, `render` não chamado, `director.ask` não chamado; diretor inválido duas vezes ⇒ `failed` com `error_kind='director'`; falha no `render` ⇒ `failed` com `error_kind='render'` e mensagem em português; `runVideoJob` com `template_id` preenchido chama o caminho novo e sem `template_id` mantém o antigo (compose chamado).
- [ ] **Step 2:** rodar ⇒ FAIL.
- [ ] **Step 3: Implementar** e limpar o diretório temporário no `finally`, como em `runVideoJob`.
- [ ] **Step 4:** `npx vitest run worker` ⇒ PASS (inclusive os testes antigos de `video.test.ts`).
- [ ] **Step 5: Commit** `feat(marketing): render por template no worker`.

### Task 11: Enfileirar por botão (API)

**Files:**
- Create: `src/lib/marketing/queue-templated.ts`, `src/lib/marketing/queue-templated.test.ts`
- Modify: `src/app/api/marketing/videos/route.ts` (+ `route.test.ts`), `src/lib/marketing/queue-video.ts` (legado define `kind` pelo `format`), `src/lib/marketing/photos.ts` (`mergePhotos` aceita `max` opcional)

**Interfaces:**
- Consumes: `getActivePack`, `findButton`, `validateFieldLimits`, `isKindFormatValid`.
- Produces: `queueTemplatedVideos(db: SupabaseClient, accountId: string, createdBy: string | null, body: unknown, pack: Pack | null): Promise<{ ok: true; videos: Record<string, unknown>[] } | { ok: false; status: 400 | 429 | 500; error: string }>`. Corpo: `{ buttonId: string; fields: Record<string, string>; imagePaths: string[]; formats: Array<'vertical' | 'square'> }`. Cria **uma linha por formato** com `kind='reels'`, `niche=pack.niche`, `template_id`, `director_input={buttonId, fields}`, `prompt=composeTemplatePrompt(button.formId, fields)`, `status='pending'`.

- [ ] **Step 1: Testes falhando:** sem pacote ativo (`pack=null`) ⇒ 400; `buttonId` inexistente no pacote ativo ⇒ 400 (cobre botão de outro nicho); `imagePaths` fora de `account-<id>/uploads/` ou com `..` ⇒ 400; fotos fora da faixa do template ou ímpar no `antes-depois` ⇒ 400 com mensagem; campo com mais caracteres que o limite ⇒ 400; `formats` vazio ou com valor desconhecido ⇒ 400; 2 formatos ⇒ 2 inserts; com 9 vídeos no dia e 2 formatos ⇒ 429 (não ultrapassa 10); rota usa `getActivePack()` e mantém 403 para conta não interna; corpo legado (sem `buttonId`) segue por `queueVideo` e `landscape` grava `kind='resumo'`.
- [ ] **Step 2:** rodar ⇒ FAIL.
- [ ] **Step 3: Implementar.** A rota despacha por `typeof body.buttonId === 'string'`. O limite diário usa `count + formats.length > DAILY_VIDEO_LIMIT`.
- [ ] **Step 4:** `npx vitest run src/lib/marketing src/app/api/marketing` ⇒ PASS.
- [ ] **Step 5: Commit** `feat(marketing): enfileirar vídeos por botão do pacote`.

### Task 12: Interface do dono

**Files:**
- Create: `src/components/marketing/pack-picker.tsx`, `src/lib/marketing/status-label.ts`, `src/lib/marketing/status-label.test.ts`
- Modify: `src/app/(dashboard)/marketing/page.tsx`, `src/app/(dashboard)/marketing/social-modal.tsx`, `src/app/(dashboard)/marketing/photo-picker.tsx` (limite vindo do template)

**Interfaces:**
- Produces: `videoStatusLabel(video: Pick<MarketingVideo, 'status' | 'error_kind'>): string` ⇒ `"Na fila — sai quando o computador de renderização estiver ligado"`, `"Gerando…"`, `"Pronto"`, `"Precisa de atenção"` (quando `failed` com `error_kind='photos'`), `"Erro"` nos demais.

- [ ] **Step 1: Teste falhando** de `videoStatusLabel` para os 5 casos.
- [ ] **Step 2:** rodar ⇒ FAIL; implementar; rodar ⇒ PASS.
- [ ] **Step 3: `PackPicker`:** cartões grandes com os botões do pacote ativo (`getActivePack()`), campos do formulário guiado (`MARKETING_TEMPLATES[button.formId]`, reaproveitando o markup de `template-picker.tsx`), caixas para 9:16 e 1:1 (ambas marcadas por padrão), `PhotoPicker` com `max` do template e aviso do mínimo. Sem pacote ativo, `page.tsx` mostra o fluxo antigo exatamente como hoje; com pacote, o fluxo novo é o padrão e o antigo fica sob "Modo avançado".
- [ ] **Step 4:** cada cartão de vídeo mostra `videoStatusLabel` e, em `failed`, a mensagem de `error` em português; `SocialModal` inicia a legenda por `video.caption ?? generateSocialCaption(...)`.
- [ ] **Step 5: Verificar no navegador** (`preview_start` com a config do projeto, `NEXT_PUBLIC_MARKETING_NICHE=barbearia`): três botões aparecem; com `NEXT_PUBLIC_MARKETING_NICHE` vazio, só o fluxo antigo; enviar 3 fotos no `compilado` mostra o aviso de mínimo 4; screenshots anexados ao relato.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm test` ⇒ sem falhas novas.
- [ ] **Step 7: Commit** `feat(marketing): botões do pacote na aba Marketing`.

### Task 13: Render real, docs e aprovação visual

**Files:**
- Create: `worker/video-template.e2e.test.ts` (usa `describe.skipIf(!process.env.HF_E2E)`; roda com `HF_E2E=1 npx vitest run worker/video-template.e2e.test.ts`)
- Modify: `docs/worker.md`, `CHANGELOG.md`, README (tabela de env: `NEXT_PUBLIC_MARKETING_NICHE`)

- [ ] **Step 1:** teste e2e: para cada um dos 3 templates e cada formato, renderiza com 4+ fotos de exemplo geradas por `sharp` (cores sólidas com texto) e verifica por `ffprobe`: dimensões 1080×1920 ou 1080×1080, duração entre 15 e 25 s, arquivo > 0; salva os `poster.jpg` em uma pasta temporária e imprime o caminho.
- [ ] **Step 2:** executar no Mac ⇒ 6 renders passam. (Requer Chrome do HyperFrames e `ffmpeg`.)
- [ ] **Step 3:** atualizar `docs/worker.md` (fluxo novo, env, onde ficam os templates, como criar um pacote) e `CHANGELOG.md`.
- [ ] **Step 4:** enviar os 6 `poster.jpg` e um vídeo de cada template ao João para **aprovação visual**; ajustar composições até ele aprovar. Sem aprovação, não fechar o sub-projeto.
- [ ] **Step 5: Commit** `docs(marketing): worker de templates e aprovação visual`.

## Fora deste plano

Vídeo Resumo, bloco no site, demais pacotes, postagem direta, música, worker multi-Supabase e a remoção do bloqueio `isInternalAccount` (hoje o recurso só roda para contas listadas em `NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS`; liberar para CRMs de clientes é decisão do sub-projeto 3).
