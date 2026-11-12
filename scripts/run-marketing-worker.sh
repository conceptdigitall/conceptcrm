#!/bin/bash
# Runner do Worker de Marketing & Video do Concept CRM
# Gerenciado via LaunchAgent: com.conceptdigital.marketingworker

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

exec /opt/homebrew/bin/npx tsx --env-file=.env.local worker/index.ts
