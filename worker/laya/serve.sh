#!/bin/sh
# Liga a Laya na CPU com a chave do .env.local.
# CPU e não GPU: no Mac a GPU "esfria" segundos depois de parada e a 1ª busca levava 1–8 s;
# na CPU (4 threads) fica em ~0,8 s mesmo depois de pausas. Ver docs/worker.md.
set -e
cd "$(dirname "$0")/../.."
KEY=$(grep -E '^LAYA_API_KEY=' .env.local | cut -d= -f2- | tr -d '"')
if [ -z "$KEY" ]; then
  echo "Falta LAYA_API_KEY no .env.local (gere com: openssl rand -hex 32)" >&2
  exit 1
fi
LAYA_API_KEY="$KEY" LAYA_HOST=127.0.0.1 LAYA_PORT=8765 LAYA_DEVICE=cpu LAYA_THREADS=4 \
  LAYA_MODELS=multilingual LAYA_PRELOAD=1 exec worker/laya/.venv/bin/laya-serve
