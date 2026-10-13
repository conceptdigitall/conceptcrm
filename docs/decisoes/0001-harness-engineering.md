# 0001 — Adoção do Harness Kit

- **Data:** 2026-10-13
- **Contexto:** Agentes de IA demandavam verificação manual constante do João para evitar commits sem testes ou ações de risco.
- **Decisão:** Integrar o kit de harness engineering (hooks git, Claude Code settings, `npm run verify` e AGENTS.md conciso).
- **Alternativas:** Duplicar scripts em cada repo (descartado por manutenção) ou apenas confiar em instruções em prompt (descartado por falhas repetidas).
- **Consequência:** Ações perigosas são barradas mecanicamente por hooks e o encerramento da tarefa exige `npm run verify` verde.
