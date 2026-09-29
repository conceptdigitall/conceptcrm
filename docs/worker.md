# Worker local (Prospecção e Marketing)

As abas Prospecção e Marketing só criam pedidos. Quem processa é o worker,
que roda na máquina da Concept (a Vercel não roda Docker nem Chrome/FFmpeg).

## Requisitos
- Node 22+, Docker Desktop aberto, FFmpeg (`brew install ffmpeg`)
- Espaço livre em disco: deixe pelo menos ~5 GB. O Docker e o render (Chrome + FFmpeg)
  usam bastante memória, e com o disco quase cheio o Docker fica em modo só leitura e o
  render pode esgotar o espaço.
- `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY`

## Rodar
    npm run worker

Ctrl+C para parar (termina o job atual antes). Pedidos feitos com o worker
parado ficam "Na fila" e são processados quando ele voltar. Jobs travados em
"running" por mais de 30 min voltam para a fila na inicialização.

## Custos e limites
- Prospecção: grátis; o Google pode bloquear buscas grandes (use proxy se precisar).
  Uso interno: o scraper viola os termos do Google Maps, e o CRM nunca envia mensagem sozinho.
- Vídeo: custo dos tokens do Claude por vídeo (até 3 chamadas se a composição precisar de correção).
  O modelo é `claude-opus-5-5` (constante `MODEL` em `worker/video.ts`); trocar para
  `claude-sonnet-5-5` corta o custo pela metade.

## Mover para um servidor
Rodar o mesmo `npm run worker` num VPS com Docker, Node 22+ e FFmpeg, com as mesmas variáveis.
