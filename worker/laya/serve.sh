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
export LAYA_API_KEY="$KEY" LAYA_HOST=127.0.0.1 LAYA_PORT=8765 LAYA_DEVICE=cpu LAYA_THREADS=4 \
  LAYA_MODELS=multilingual LAYA_PRELOAD=1
# laya-serve + /v1/embed (vetores para as colunas que aprendem, parte B), no mesmo processo.
# Opcional: LAYA_PLUS no .env.local aponta para um plugin com mais rotas
# (ex.: a dificuldade de tarefa do segundo cérebro). Ver serve_plus.py.
LAYA_PLUS=$(grep -E '^LAYA_PLUS=' .env.local | cut -d= -f2- | tr -d '"')
export LAYA_PLUS
exec worker/laya/.venv/bin/python worker/laya/serve_plus.py
