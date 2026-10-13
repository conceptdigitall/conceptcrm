# Funil Concept IA: conteúdo no Instagram → WhatsApp → recepcionista → Meet

Data: 2026-10-13 · Status: aprovado em conversa, aguardando revisão da spec

## Objetivo

A Concept Digital precisa de um funil que rode sozinho:
1. Um time de IA publica no Instagram.
2. Quem se interessa chega ao WhatsApp.
3. Uma recepcionista de IA qualifica o lead e agenda reunião no Google Meet com o João.

O funil é a vitrine do SaaS da Concept (marketing com IA, tráfego pago com IA, recepcionista de IA, CRM, página de vendas/e-commerce).

Este é o **sub-projeto 1 de 6**. Os módulos nascem multi-conta (`account_id`), para depois virarem os produtos "Automação de Marketing" e "Recepcionista IA" vendidos aos clientes.

Fora do escopo desta spec (cada um ganha a sua):
- SaaS de planos/checkout
- Tráfego pago com IA
- Produtização para clientes
- Prospecção outbound (fase B, via Mailerfind/e-mail)

## Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Prospecção | Só inbound na v1; outbound fica para a fase B | WhatsApp não oficial com disparo frio leva a banimento do chip |
| Onde mora | Dentro do CRM Concept (`wacrm`) | Evolution, Laya, Kanban e Calendar já existem; já nasce multi-conta |
| Autonomia do conteúdo | Aprovação em 1 toque no Telegram; sem resposta em 4h, auto-aprova | Autônomo na prática, com rede contra erro de marca |
| Orquestração | Fila no Supabase + `npm run worker` (padrão atual) | Sem peça nova para hospedar |

## Módulos

### M1 Conteúdo (worker)
- `content_plans`: pauta semanal no mix 60% dores de nicho / 40% autoridade Concept, gerada pelo Sonnet.
- `content_items`: roteiro, legenda, hashtags, mídia renderizada (HyperFrames + narração ElevenLabs, obrigatória em vídeo), `scheduled_for`, `ig_media_id`.
- Status: `rascunho → aguardando → aprovado → postado | falhou`.
- Aprovação: o bot do Telegram envia a pauta do dia às 08h00 com os botões ✅ / ✏️ (pede ajuste em texto) / ❌. Sem resposta até 12h00, vira `aprovado` (`approved_by = 'auto'`).
- Publicação: Instagram Graph API (criar container → `media_publish`). Reaproveitar os prompts e templates do Hermes Marketing e os templates de vídeo de `src/lib/marketing`.

### M2 Inbound Instagram (rota Next + webhook Meta)
- `POST /api/webhooks/instagram`: valida a assinatura `X-Hub-Signature-256`.
- O comentário precisa ter palavra-chave configurável por conta (ex.: "QUERO"). DM conta sempre.
- Os dois casos recebem resposta privada com `https://wa.me/<numero>?text=<mensagem com código de origem>`.
- `ig_events`: tipo, `ig_user_id`, `ig_media_id`, código de origem. O código volta na 1ª mensagem do WhatsApp e liga o lead ao post (atribuição).

### M3 Recepcionista (worker sobre a Evolution)
- Atende só conversas que o lead iniciou. Nunca inicia conversa.
- `reception_sessions`: `contact_id`, etapa, respostas, nota, `outcome`, origem.
- Perguntas, uma por vez, em linguagem natural:
  1. Nicho/negócio
  2. Interesse (marketing IA, tráfego, recepcionista, CRM, site/e-commerce; pode ser mais de um)
  3. Momento (já fatura? tem time de atendimento?)
  4. Urgência (agora × pesquisando)
- Classificação de cada resposta: Laya (`src/lib/laya`, perguntas fechadas). Se a Laya estiver offline, ou com confiança abaixo de 0,7, decide o Claude Haiku.
- Saídas:
  - **quente** (já fatura + agora): M4 oferece 3 horários
  - **morno**: link dos planos + follow-up em 3 dias (só se o lead respondeu nas últimas 24h; senão, tarefa para o João)
  - **frio**: responde a dúvida + tag `curioso`, sem insistir
  - **humano**: pediu pessoa ou 2 respostas sem entender; transfere e pausa a IA (reaproveita `feat/api-v1-pausar-ia`)
- Cria/atualiza o contato e o deal no Kanban, com a etapa conforme a saída.
- Áudio: transcreve (Whisper) e segue a conversa.
- Guardrails: nunca cita preço fora da tabela de planos nem prazo de entrega.

### M4 Agenda (reaproveitar `src/lib/calendar/ai-calendar-tools.ts`)
- Usa a disponibilidade (`/api/v1/availability`) e a criação com Meet que já existem.
- Oferece 3 horários livres nos próximos 5 dias úteis; o lead escolhe e o evento é criado com link Meet.
- `meetings` (ou `appointments`, se a tabela atual servir): vínculo com o deal.
- Lembrete no WhatsApp 1h antes, dentro da conversa já aberta.

## Fluxo

post IG → comentário/DM → resposta privada com wa.me → lead chama no WhatsApp → recepcionista (Laya/Haiku) → contato + deal → Meet → João

## Falhas

| Falha | Comportamento |
|---|---|
| Render ou post falhou | 2 retries com backoff; na 3ª, status `falhou` + aviso no Telegram |
| Token Meta (60 dias) | Renova aos 50 dias; se falhar, aviso + pausa das publicações |
| Mac desligado | Posts atrasam na fila. A recepcionista roda numa rota serverless da Vercel com Haiku; o lead nunca fica sem resposta |
| Evolution desconectada | Health check a cada 5 min + alerta no Telegram |
| Calendar falhou | "Já te mando os horários" + escala para o João |

## Segurança
- Segredos (Meta, Google, Telegram, Evolution, ElevenLabs) só em `.env.local` e nas variáveis da Vercel. Nunca no banco em texto puro.
- Webhook da Meta com verificação de assinatura; tabelas novas com RLS por `account_id`.
- Logs mascaram telefone (só os últimos 4 dígitos).
- Limite de 25 posts/dia por conta.

## Testes
- Unitários:
  - máquina de estados da recepcionista (quente/morno/frio/humano)
  - parser e assinatura do webhook da Meta
  - escolha de 3 horários livres
  - auto-aprovação após 4h
- Integração: Evolution e Calendar mockados. Laya com 30 conversas rotuladas; acerto ≥ 85% contra o gabarito do Haiku.
- E2E manual: comentar "QUERO" num post de teste e chegar até o evento criado no Meet.

## Fases (cada uma vai ao ar sozinha)
1. **M3 + M4**: recepcionista + agenda (link manual na bio já funciona)
2. **M2**: inbound Instagram
3. **M1**: time de conteúdo com aprovação no Telegram

## Pré-requisitos do João
- Conta Instagram Business ligada a uma Página do Facebook.
- App na Meta com `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages` (pode exigir App Review).
- OAuth do Google Calendar autorizado (conferir o estado da branch `fix/calendar-auth`).
- Bot do Telegram (reaproveitar o do Hermes Marketing).

## Pronto quando
- Um lead de teste sai de um comentário e termina com reunião no Meet agendada, sem intervenção manual.
- 7 dias seguidos de posts publicados com aprovação em 1 toque.
