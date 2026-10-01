# Plano de Implementação — Busca Dinâmica com Laya na Prospecção (PR 3)

Branch: `feat/prospeccao-busca-dinamica` · Base: `main`

---

## Tarefa 1: Algoritmo de Ranking e Filtros (`dynamic-search.ts`)
- [ ] Criar funções de extração de regiões distintas (cidade/bairro) a partir dos leads.
- [ ] Criar funções de agrupamento de público (Saúde, Beleza, Alimentação, Serviços, etc.).
- [ ] Criar função de cálculo de probabilidade de fechamento combinando:
  - Intenção da query
  - Satisfação do cliente (nota e avaliações do Google)
  - Colunas da Planilha Preditiva já calculadas pela Laya (PR #9)
  - Oportunidade prática (se tem WhatsApp, se não tem site)
- [ ] Escrever testes unitários em `src/lib/prospecting/dynamic-search.test.ts`.

---

## Tarefa 2: Endpoint `/api/prospecting/rank`
- [ ] Criar rota POST autenticada em `src/app/api/prospecting/rank/route.ts`.
- [ ] Conectar ao Laya via `layaBatch` quando `LAYA_URL` estiver acessível.
- [ ] Aplicar fallback gracioso caso o Laya esteja offline.
- [ ] Escrever testes de integração em `src/app/api/prospecting/rank/route.test.ts`.

---

## Tarefa 3: Componente `NaturalSearchBar`
- [ ] Criar `src/components/prospecting/natural-search-bar.tsx` com:
  - Input de busca com ícone de IA (Sparkles/Brain) e botão de envio
  - 3 Chips de sugestão rápida (Lei de Hick)
  - Dropdowns compactos de Região e Tipo de Público
  - Indicador de carregamento suave
  - Botão de limpar busca ativa
- [ ] Responsividade mobile rigorosa (sem rolagem horizontal, botões com boa área de clique).

---

## Tarefa 4: Integração na Aba Prospecção
- [ ] Conectar o `NaturalSearchBar` no topo da lista em `src/app/(dashboard)/prospeccao/page.tsx`.
- [ ] Exibir a coluna de **Probabilidade de Fechar** (badge com porcentagem e classificação Alta/Média/Baixa) quando a busca dinâmica estiver ativa.
- [ ] Reordenar a tabela automaticamente do maior para o menor potencial.
- [ ] Manter filtros de status e colunas de IA existentes 100% funcionais lado a lado.

---

## Tarefa 5: Validação e Testes
- [ ] `npx tsc --noEmit` 100% limpo.
- [ ] `npx vitest run` com todos os testes passando.
- [ ] `npm run build` testado localmente.
