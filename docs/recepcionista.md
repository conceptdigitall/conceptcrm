# Recepcionista de IA

A recepcionista atende o lead novo no WhatsApp. Ela faz 4 perguntas, classifica o lead e marca uma call no Google Calendar. Ela nunca inicia conversa. Só manda lembrete de reunião marcada e follow-up de lead morno.

## Como ligar

1. Crie o pipeline "Funil Concept" com 5 estágios: Novo, Agendado, Morno, Curioso, Humano.
2. Faça o `insert` em `reception_settings`:
   - `account_id`: a conta
   - `pipeline_id`: o pipeline criado
   - `stage_ids` (jsonb): `{"novo": "...", "agendado": "...", "morno": "...", "curioso": "...", "humano": "..."}`
   - `plans_url`: a página de planos (pode ser provisória)
3. Coloque `enabled = true`.

## Como desligar

Faça `enabled = false`. O robô antigo volta a responder na hora.

O robô antigo também continua respondendo quando `enabled = false` ou quando as configurações estão incompletas.

## Variáveis da Vercel

Todas estão documentadas em `.env.local.example`.

| Variável | Para quê |
|---|---|
| `LAYA_URL` | URL do ngrok que expõe a Laya |
| `LAYA_API_KEY` | chave da Laya |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | acesso ao Google Calendar |
| `GOOGLE_CALENDAR_ID` | agenda que recebe as reuniões |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OPS_CHAT_ID` | avisos para o João |
| `GROQ_API_KEY` ou `OPENAI_API_KEY` | transcrição de áudio |
| `ADMIN_WHATSAPP_NUMBERS` | números de administradores |
| `AUTOMATION_CRON_SECRET` | segredo do cron |

Sem a chave Groq ou OpenAI, todo áudio recebe: "Não consegui ouvir o áudio, pode me mandar por escrito?".

A instância da Evolution precisa guardar as mensagens. Sem isso, o download do áudio falha.

## Pinger de 5 minutos

O cron roda follow-ups e lembretes. Use um pinger externo (cron-job.org) a cada 5 minutos:

```
GET /api/reception/cron
x-cron-secret: <valor de AUTOMATION_CRON_SECRET>
```

## Refresh token do Google

1. No Google Cloud, crie um OAuth Client e ative a API do Calendar.
2. No OAuth Playground, marque "Use your own OAuth credentials" e informe o client.
3. Use o escopo `https://www.googleapis.com/auth/calendar.events`.
4. Autorize com a conta que recebe as reuniões.
5. Copie o refresh token para `GOOGLE_OAUTH_REFRESH_TOKEN` na Vercel.

## Avaliar a Laya

Suba a Laya (`npm run laya`) e rode:

```
npm run reception:eval
```

O script compara a Laya (sem fallback) com o Haiku (gabarito) em 30 respostas sintéticas. Ele imprime o acerto por etapa e o total. Sai com código 1 se o total ficar abaixo de 85%.

Se ficar abaixo, veja as divergências e ajuste as `instructions` em `src/lib/reception/classify.ts`. Não baixe o limiar.
