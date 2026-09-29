# Prospecção e Marketing — design

Data: 2026-09-28
Status: aprovado em conversa, aguardando plano de implementação

## Contexto e objetivo

O CRM Concept (`wacrm`) é o template base copiado para cada cliente (Barbearia
do Alemão, CRM Concept Clínicas, etc). Este documento cobre duas áreas novas
no dashboard, decididas em brainstorming com o João em 2026-09-28:

1. **Prospecção** — geração de leads via Mailerfind, direto no CRM.
2. **Marketing** — geração de vídeos promocionais com IA (Runway), direto no
   CRM.

Ambas devem funcionar sem comprometer o CRM existente: instâncias já
copiadas (clientes atuais) recebem a migration e veem as abas em estado
"não configurado" até conectar suas próprias credenciais — nada quebra por
falta de chave.

**Fora de escopo:** o skill `/brag` (Hyperframes) não faz parte disto. Ele é
um workflow que roda numa sessão do Claude Code, lendo código-fonte de um
projeto para gerar um vídeo de lançamento sobre esse projeto — não é uma API
que o backend do CRM possa chamar em nome de um cliente final. Ele continua
sendo uma ferramenta separada, de uso manual da Concept Digital para material
de portfólio, não integrada ao produto.

## Decisões tomadas

- **Prospecção:** integração ativa via API do Mailerfind (não importação
  manual). Cada instância de cliente usa **sua própria conta/API key** do
  Mailerfind (não uma conta única da agência).
- **Marketing:** geração de vídeo ao vivo dentro do CRM via **Runway API**
  (não o `/brag`). Cada instância de cliente usa **sua própria conta/API key**
  do Runway.
- Leads gerados ficam numa lista própria em Prospecção (com status), e só
  viram Contato quando promovidos manualmente — nunca entram automático no
  pipeline de vendas.
- Geração de vídeo: prompt livre + upload de imagem opcional (sem formulário
  guiado por enquanto).

## 1. Base compartilhada: credenciais de integração

Nova tabela Supabase `integration_credentials`:

| coluna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| account_id | uuid fk → accounts | RLS por account_id, mesmo padrão do resto do schema |
| provider | text | `'mailerfind' \| 'runway'` |
| encrypted_key | text | cifrado em repouso (ver "Segurança") |
| connected_by | uuid fk → users, nullable | |
| connected_at | timestamptz | |
| updated_at | timestamptz | |

Unique constraint em `(account_id, provider)`.

Nova seção em Settings → "Integrações": um card por provider (Mailerfind,
Runway) com campo de API key, botão salvar/testar conexão, e status
(conectado / não conectado). Segue o padrão visual de
`components/settings/api-keys-settings.tsx`, mas é uma tabela e um propósito
diferentes — aquela tabela (`api_keys`) é para chaves que o CRM *emite* para
chamadores externos da API pública dele; esta é o inverso, chaves que o CRM
*consome* de terceiros. Não reaproveitar a mesma tabela.

Toda chamada às APIs externas passa por route handlers server-side
(`api/prospeccao/*`, `api/marketing/*`) que leem a chave do banco e nunca a
expõem ao client. Sem chave conectada, a UI mostra um empty-state "conecte
sua conta de [Provider] em Configurações" em vez de tentar chamar a API.

**Segurança:** `encrypted_key` cifrado com uma chave de aplicação
(env var, não por-cliente) — nunca em texto plano no banco. Verificar se o
projeto já tem alguma util de criptografia (`src/lib/crypto` ou similar) antes
de introduzir uma nova dependência.

## 2. Prospecção

Nova rota `(dashboard)/prospeccao`, item novo no menu lateral do dashboard
(`dashboard-shell.tsx`).

Nova tabela `leads`:

| coluna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| account_id | uuid fk | RLS |
| source | text | `'instagram' \| 'twitter' \| 'maps'` |
| mailerfind_analysis_id | text | id externo do Mailerfind |
| name | text | |
| handle | text nullable | |
| email | text nullable | |
| phone | text nullable | |
| raw_data | jsonb | payload bruto do Mailerfind, para campos futuros sem migration |
| status | text | `'novo' \| 'contatado' \| 'qualificado' \| 'descartado'` |
| contact_id | uuid fk → contacts, nullable | setado ao promover |
| created_at | timestamptz | |

### Fluxo

1. Usuário abre "Nova prospecção": escolhe plataforma (Instagram / Twitter /
   Google Maps), modo (ex: followers, hashtag, keyword, account_audience,
   business search — conforme a plataforma) e o alvo (handle, hashtag, ou
   query + área).
2. Route handler cria e inicia a análise no Mailerfind com a key do cliente
   (`mailerfind_analysis_create` → `mailerfind_analysis_start`), grava o
   `analysis_id` numa linha "em andamento".
3. Polling (client-side, intervalo curto, mesmo padrão de outras features
   assíncronas do CRM) via `mailerfind_analysis_get` até status completo.
4. Ao completar, importa os prospects (`mailerfind_list_get_prospects`) para
   `leads` com `status = 'novo'`.
5. Tela principal: tabela de leads com filtro por status e por fonte, ação
   em massa e individual "Promover para Contato" (cria linha em `contacts`,
   seta `contact_id`).

### Erros

- Falha na criação/execução da análise: linha marcada com um estado de erro
  visível, com opção de tentar de novo — nunca falha silenciosa.
- Chave inválida/expirada: mensagem clara apontando de volta pra
  Configurações → Integrações.

## 3. Marketing (vídeo com IA)

Nova rota `(dashboard)/marketing`, item novo no menu lateral.

Nova tabela `marketing_videos`:

| coluna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| account_id | uuid fk | RLS |
| prompt | text | |
| source_image_url | text nullable | Supabase Storage |
| format | text | `'vertical' \| 'square' \| 'landscape'`, default vertical (Stories/Reels) |
| status | text | `'pending' \| 'processing' \| 'done' \| 'failed'` |
| runway_task_id | text nullable | |
| video_url | text nullable | |
| created_by | uuid fk → users | |
| created_at | timestamptz | |

### Fluxo

1. Form: campo de prompt livre + upload opcional de 1 imagem.
2. Se tem imagem: upload pro Supabase Storage primeiro, pega URL pública/assinada.
3. Route handler chama a API do Runway (image-to-video se tem imagem,
   text-to-video se não) com a key do cliente, grava `runway_task_id`,
   status `processing`.
4. Polling client-side até o Runway retornar `done`/`failed`; salva
   `video_url` no sucesso.
5. Tela: form de geração no topo + galeria em grid abaixo (preview inline,
   download, deletar).

### Erros

- Geração falhou no provider: status `failed` visível na galeria com motivo
  (se o Runway retornar um), botão de tentar de novo com o mesmo prompt.
- Chave inválida/sem créditos: mesma UX de "conecte/verifique sua conta" da
  Prospecção.

## Migração e rollout no template

- Duas migrations Supabase novas (`integration_credentials`, `leads`,
  `marketing_videos` — pode ser uma migration por tabela, seguindo o padrão
  numerado/datado existente em `supabase/migrations/`).
- Testado primeiro no CRM Concept base (Portfolio). Depois replicado manualmente
  para as cópias existentes (Barbearia do Alemão, CRM Concept Clínicas) como
  já é o processo hoje — ver `crm-concept-template-copies` (memória): cada
  cópia é uma instância separada, sem git compartilhado em pelo menos um caso.
- Nenhuma migration deve quebrar dados existentes; ambas as tabelas novas são
  aditivas e as abas novas degradam graciosamente sem credenciais.

## Testes

- Vitest para os route handlers (`api/prospeccao/*`, `api/marketing/*`) com
  fetch mockado para Mailerfind/Runway — mesmo padrão dos testes existentes
  em `src/lib/api-keys/*.test.ts`.
- Testar explicitamente o caminho "sem credencial conectada" (empty-state,
  não crash).

## Abertos para a fase de plano

- Confirmar no site/docs do Mailerfind e da Runway que ambos realmente expõem
  uma API key própria para integração de terceiros (distinta do MCP que esta
  sessão usa) — não assumir, verificar antes de implementar a tela de
  Integrações.
- Escolher a lib de criptografia para `encrypted_key` (ou confirmar uma já
  existente no projeto).
- Definir os "modos" exatos do Mailerfind expostos por plataforma na UI de
  Prospecção (mapear para as opções reais: followers, following, commenters,
  hashtag, keyword, location, account_likers, account_commenters,
  account_audience para Instagram; followers, following, repliers,
  retweeters, quoters, account_mentions, account_commenters, keyword para
  Twitter/X; business search para Google Maps).
