# Plano de Implementação: Prospecção Vertical por Nicho

**Spec de Referência:** `wacrm/docs/superpowers/specs/2026-10-07-prospeccao-vertical-nichos.md`  
**Data:** 2026-10-07  
**Branch:** `feat/prospeccao-vertical-nichos`

---

## 📋 Quebra de Tarefas (/break)

### Fase 1: Camada de Domínio & Tipos (TDD)
- [ ] **Task 1: Configuração de Nichos e Metadados (`src/config/niches.ts`)**
  - Definir tipo `NicheKey = 'concept' | 'advogado' | 'clinica' | 'fotografo' | 'barbeiro' | 'ecommerce' | 'imobiliaria'`.
  - Configurar dias padrão de ciclo de retorno, títulos e badges por nicho.
  - Testes unitários para validar completude dos dados.

- [ ] **Task 2: Playbooks Guiados de Mensagem (`src/lib/prospecting/playbooks.ts`)**
  - Estrutura com templates por nicho (mínimo 3 modelos por nicho).
  - Gerador de copy determinístico com substituição de variáveis (`[Nome]`, `[Serviço]`, `[Condição]`).
  - Testes unitários com Vitest em `src/lib/prospecting/playbooks.test.ts`.

- [ ] **Task 3: Motor do Radar de Reativação (`src/lib/prospecting/reactivation.ts`)**
  - Algoritmo que filtra contatos com base em `last_interaction_at` ou `last_appointment_at`.
  - Classificação de urgência/temperatura do retorno (ex.: *No ciclo*, *Atrasado*, *Crítico*).
  - Testes unitários em `src/lib/prospecting/reactivation.test.ts`.

- [ ] **Task 4: Parser e Sanitizador de CSV (`src/lib/prospecting/csv-importer.ts`)**
  - Leitor de CSV com detecção de delimitador (vírgula ou ponto-e-vírgula).
  - Sanitização de números de WhatsApp (formato brasileiro +55).
  - Deduplicação contra lista de contatos existentes.
  - Testes unitários em `src/lib/prospecting/csv-importer.test.ts`.

---

### Fase 2: Componentes de UI (Design System Concept)
- [ ] **Task 5: Modal de Playbook Guiado (`src/components/prospecting/playbook-picker-modal.tsx`)**
  - Implementar seletor com tabs: *Modelos Prontos* e *Texto Livre*.
  - Inputs dinâmicos de acordo com o modelo selecionado.
  - Caixa de preview da mensagem e botões de ação (Abrir WhatsApp, Copiar, Marcar Contatado).

- [ ] **Task 6: Modal de Importação de CSV (`src/components/prospecting/csv-import-modal.tsx`)**
  - Drag & drop de arquivo `.csv`.
  - Pré-visualização das 5 primeiras linhas e contagem de contatos válidos.
  - Confirmação de importação em lote para a base.

- [ ] **Task 7: Card e Lista do Radar de Reativação (`src/components/prospecting/reactivation-radar.tsx`)**
  - Tabela/cards responsivos exibindo clientes inativos elegíveis.
  - Indicador visual de dias sem retorno e botão direto para abrir o Playbook.

---

### Fase 3: Integração na Aba de Prospecção
- [ ] **Task 8: Orquestrador da Aba (`src/components/prospecting/vertical-prospecting.tsx`)**
  - Alternância automática: se for a conta da Concept, exibe a busca clássica do Maps + Radar.
  - Se for um nicho vertical de cliente (ex: Advogado, Barbearia, Fotógrafo), exibe o Radar de Reativação + Importador CSV + Playbooks.
  - Integração no `page.tsx` de `/prospeccao`.

---

### Fase 4: Validação & Quality Gates
- [ ] **Task 9: Execução dos Quality Gates**
  - Todos os testes no Vitest rodando e passando.
  - Teto de 350 linhas verificado (`npx eslint`).
  - Typecheck limpo (`npx tsc --noEmit`).
