#!/bin/sh
# Liga tudo que a Prospecção precisa no Mac: Laya (porta 8765), túnel ngrok (para a
# produção na Vercel alcançar a Laya) e o worker. O que já estiver rodando é mantido.
# Ctrl+C desliga o que este comando ligou.
cd "$(dirname "$0")/.."
LOGS=.servicos-logs
mkdir -p "$LOGS"
env_get() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- | tr -d '"'; }
laya_ok() { curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/health | grep -q 200; }

trap 'echo; echo "Desligando…"; kill 0' INT TERM

if laya_ok; then
  echo "Laya: já estava ligada"
else
  sh worker/laya/serve.sh > "$LOGS/laya.log" 2>&1 &
  printf "Laya: carregando o modelo"
  i=0
  until laya_ok; do
    i=$((i + 1))
    if [ "$i" -gt 90 ]; then echo " falhou (veja $LOGS/laya.log)"; kill 0; fi
    printf "."
    sleep 2
  done
  echo " ok"
fi

NGROK_URL=$(env_get NGROK_URL)
if [ -z "$NGROK_URL" ]; then
  echo "ngrok: NGROK_URL vazio no .env.local; a produção fica sem Laya (ordem básica)"
elif curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -q "$NGROK_URL"; then
  echo "ngrok: já estava ligado em $NGROK_URL"
else
  ngrok http 8765 --url="$NGROK_URL" --log=stdout > "$LOGS/ngrok.log" 2>&1 &
  sleep 3
  if curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -q "$NGROK_URL"; then
    echo "ngrok: $NGROK_URL"
  else
    echo "ngrok: não subiu (veja $LOGS/ngrok.log)"
  fi
fi

docker info > /dev/null 2>&1 || echo "Aviso: Docker parado; buscas no Google Maps falham até abrir o Docker"

if pgrep -f "tsx.*[w]orker/index.ts" > /dev/null; then
  echo "worker: já estava rodando"
else
  npx tsx --env-file=.env.local worker/index.ts &
fi

echo "Tudo ligado. Logs em $LOGS/. Ctrl+C desliga."
wait
