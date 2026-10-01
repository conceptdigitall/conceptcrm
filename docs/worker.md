# Worker local (Prospecção e Marketing)

As abas Prospecção e Marketing só criam pedidos. Quem processa é o worker,
que roda na máquina da Concept (a Vercel não roda Docker nem Chrome/FFmpeg).

## Requisitos
- Node 22+, Docker Desktop aberto, FFmpeg (`brew install ffmpeg`)
- Espaço livre em disco: deixe pelo menos ~5 GB. O Docker e o render (Chrome + FFmpeg)
  usam bastante memória, e com o disco quase cheio o Docker fica em modo só leitura e o
  render pode esgotar o espaço.
- `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` e
  `NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS` (id da conta da Concept; as abas e o worker só atendem
  essas contas). Na Vercel, cadastre `NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS` também, senão as
  abas ficam escondidas e as rotas respondem 403.

## Rodar
    npm run worker

Ctrl+C para parar. Pedidos feitos com o worker parado ficam "Na fila" e são
processados quando ele voltar. Ao iniciar, o worker devolve para a fila todo job
que ficou em "running" (ele roda sozinho, então esses jobs ficaram órfãos).
Rode só um worker por vez.

## Custos e limites
- Prospecção: grátis; o Google pode bloquear buscas grandes (use proxy se precisar).
  Uso interno: o scraper viola os termos do Google Maps, e o CRM nunca envia mensagem sozinho.
- Vídeo: custo dos tokens do Claude por vídeo (até 3 chamadas se a composição precisar de correção).
  O modelo é `claude-opus-5-5` (constante `MODEL` em `worker/video.ts`); trocar para
  `claude-sonnet-5-5` corta o custo pela metade.

## Mover para um servidor
Rodar o mesmo `npm run worker` num VPS com Docker, Node 22+ e FFmpeg, com as mesmas variáveis.

## Planilha Preditiva (Laya)

As colunas de IA da aba Prospecção são preenchidas pelo Laya, um modelo que roda no Mac.

Uma vez só:

    brew install uv
    uv venv --python 3.12 worker/laya/.venv
    uv pip install --python worker/laya/.venv/bin/python -r worker/laya/requirements.txt

No `.env.local`: `LAYA_URL=http://127.0.0.1:8765` e `LAYA_API_KEY=` (gere com `openssl rand -hex 32`). O `npm run laya` recusa iniciar sem a chave, e a Laya responde 401 a quem não a envia.

A Laya roda na **CPU** (4 threads) de propósito: no Mac a GPU "esfria" segundos depois de parada e a primeira busca levava de 1 a 8 s; na CPU fica em ~0,8 s para 12 leads mesmo depois de pausas (medido em 2026-10-01). Lotes grandes do worker ficam um pouco mais lentos (58 leads: 3,0 s contra 2,3 s na GPU).

**Comando único:** `npm run servicos` liga Laya + túnel ngrok (`NGROK_URL` no `.env.local`) + worker, pula o que já estiver rodando, avisa se o Docker estiver parado e desliga os três no Ctrl+C. Logs em `.servicos-logs/`.

**Produção (Vercel):** a Laya continua no Mac. Para a Vercel alcançá-la, exponha a porta 8765 por um túnel com endereço fixo e cadastre na Vercel `LAYA_URL` (o endereço público do túnel) e `LAYA_API_KEY` (a mesma do `.env.local`). Se o Mac estiver desligado, a busca desiste em 6 s e usa só a ordem instantânea.

Para usar, dois terminais na pasta do CRM:

    npm run laya     # carrega o modelo (~1–2 GB de memória) e fica ouvindo só no próprio Mac
    npm run worker

Sem o `npm run laya`, a coluna falha com "Laya desligado: rode npm run laya"; ligue e clique
em "Tentar de novo". Quando uma busca nova termina, as colunas prontas voltam para a fila e
só os leads novos são preenchidos. Correções feitas à mão nunca são sobrescritas.
