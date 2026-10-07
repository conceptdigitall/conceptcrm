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
- Vídeo: custo dos tokens do Claude por vídeo. No caminho antigo (texto livre) são até 3 chamadas se a
  composição precisar de correção; no caminho por pacote de nicho (abaixo) são 1 chamada de visão para
  checar as fotos e 1 ou 2 do diretor, todas curtas (centavos). O modelo vem de `VIDEO_MODEL`
  (padrão `claude-haiku-4-5-20251001`).

## Vídeos por pacote de nicho (Reels)

Cada CRM liga **um** pacote de nicho pela variável `NEXT_PUBLIC_MARKETING_NICHE` (hoje só `barbearia`).
Sem ela, a aba Marketing segue só com o fluxo antigo (texto livre). Com ela, o dono vê os botões do
nicho (ex.: Compilado de cortes, Antes e depois, Oferta da semana), preenche poucos campos, envia as
fotos e marca 9:16 e/ou 1:1. Cada formato vira um pedido (uma linha em `marketing_videos`).

Como o worker processa um pedido com `template_id`:
1. confere os caminhos das fotos (só a pasta de uploads da conta) e baixa;
2. checa resolução (lado menor ≥ 720 px) e, com o Claude, se a foto está escura ou borrada: se houver
   problema, o pedido vira "Precisa de atenção" com a mensagem em português e **nada é renderizado**;
3. o diretor (Claude) devolve só dados (texto, ordem das fotos, legenda, hashtags), validados contra o
   `template.json`; resposta fora do contrato = 1 nova tentativa, depois falha;
4. a composição HTML do template é preenchida por substituição (sem IA escrevendo HTML), passa pelo
   `hyperframes check` e é renderizada. `check` e `render` repetem uma vez em caso de falha de rede
   (o GSAP vem de CDN e as fontes do Google Fonts: o render precisa de internet).

Onde ficam as coisas: `src/lib/marketing/packs/<nicho>/pack.ts` (botões e specs) e
`.../templates/<id>/{template.json,composition.html}`. Para criar um nicho novo: copie a pasta
`barbearia`, registre em `src/lib/marketing/packs/index.ts` e ligue com `NEXT_PUBLIC_MARKETING_NICHE`.
Os 3 templates da Barbearia saem em 15–25 s, sem áudio.

Teste de render real (Chrome + ffmpeg + internet; leva uns 3 minutos para os 6 casos):

    HF_E2E=1 npx vitest run worker/video-template.e2e.test.ts

As capas ficam em `$TMPDIR/hf-e2e/` para olhar. O `npm test` normal pula esse arquivo.

Limite atual: o worker conversa com **um** projeto Supabase (o do `.env.local`), e o recurso só
atende contas listadas em `NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS`. Atender CRMs de clientes com banco próprio
é outra etapa.

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
