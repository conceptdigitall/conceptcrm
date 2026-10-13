<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:harness -->
## Mapa

- `src/app/`: rotas Next.js (App Router).
- `src/components/`: componentes visuais e de UI.
- `src/lib/`: bibliotecas auxiliares, clientes Supabase e regras de negócio.
- `worker/`: worker WhatsApp/IA em segundo plano (ver [docs/worker.md](docs/worker.md)).
- `supabase/migrations/`: migrações do banco Postgres.
- `mcp-server/`: servidor MCP para integrações (ver [docs/mcp.md](docs/mcp.md)).
- `messages/`: dicionários de internacionalização (i18n).
- Documentação: [docs/arquitetura.md](docs/arquitetura.md), [docs/public-api.md](docs/public-api.md), [docs/docker.md](docs/docker.md), [docs/multi-waba.md](docs/multi-waba.md), [docs/decisoes/README.md](docs/decisoes/README.md).

## Comandos

- `npm run verify`: typecheck, lint, test, build e validação de estado do harness.
- `npm run dev`: inicia servidor Next.js em desenvolvimento.
- `npm run worker`: executa o worker do WhatsApp em desenvolvimento.
- `npm run servicos`: reinicia o worker após `git pull`.

## Fluxo obrigatório

mapa de impacto → OK do João se ≥3 arquivos, schema, auth ou deploy → implementar → verify → screenshot se UI.

## Nunca sem OK

migration em prod, merge/push na main, editar .env*, commit com autor ≠ sacconceptdigital@gmail.com.

## Armadilhas

- **Pooler Supabase**: consultas paralelas travam na porta 6543; serializar chamadas ([aprendizados/regras.md](../../../Segundo%20cérebro/SimpleBrain/aprendizados/regras.md#L17)).
- **Autor Vercel**: autor de commit deve ser estritamente `sacconceptdigital@gmail.com` ([aprendizados/processo.md](../../../Segundo%20cérebro/SimpleBrain/aprendizados/processo.md#L518)).
- **Git quebrado**: binário em `/usr/local/bin` quebra com Bad CPU type; sempre usar `/usr/bin/git` ([aprendizados/processo.md](../../../Segundo%20cérebro/SimpleBrain/aprendizados/processo.md#L239)).
- **Numeração de Migrações**: conferir `supabase/migrations/` em branches abertas antes de numerar; duplicados quebram o CI ([aprendizados/supabase.md](../../../Segundo%20cérebro/SimpleBrain/aprendizados/supabase.md#L142) e [regras.md](../../../Segundo%20cérebro/SimpleBrain/aprendizados/regras.md#L41)).
<!-- END:harness -->
