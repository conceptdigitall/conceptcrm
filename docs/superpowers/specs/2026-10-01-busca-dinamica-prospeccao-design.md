# Busca Dinâmica com Laya na Prospecção — Design (PR 3)

Data: 2026-10-01 · Status: em desenvolvimento · Branch: `feat/prospeccao-busca-dinamica`

## 1. Objetivo

Na aba Prospecção do CRM Concept, permitir que o João ou seus clientes (empresários leigos) busquem e priorizem leads usando **linguagem natural** (ex.: *"leads mais qualificados para comprar recepcionista de IA"* ou *"restaurantes com muito movimento para delivery"*).

A tabela se reordena automaticamente mostrando:
1. **Nível de satisfação dos clientes** (já implementado, baseado nas avaliações do Google Maps).
2. **Probabilidade de fechar negócio** (de 0% a 100%, do maior para o menor), combinando o julgamento semântico da IA Laya com as colunas já preenchidas da Planilha Preditiva (PR #9).
3. **Novos filtros rápidos e intuitivos**: tipo de público e região (bairro/cidade).

Tudo seguindo rigorosamente a **Lei de Hick** (poucas decisões por tela, chips de sugestão rápida com 1 clique) e adaptado para telas mobile (onde o João opera no dia a dia).

---

## 2. Princípios de UX (Lei de Hick & Mobile Primeiro)

- **1 Campo Inteligente com Sugestões Prontas:**
  O usuário não precisa pensar no que escrever. Três chips de 1 clique ficam visíveis logo abaixo da barra:
  - 🤖 *"Mais qualificados para Recepcionista de IA"*
  - 📈 *"Maior potencial de fechamento (alto faturamento)"*
  - 🌐 *"Precisam de presença digital (sem site próprio)"*
- **Filtros Limpos e Diretos:**
  Dois seletores adicionais simples ao lado do status:
  - **Região:** bairros/cidades detectados automaticamente a partir dos leads no banco.
  - **Tipo de público:** agrupamento amigável (ex.: Saúde & Bem-estar, Beleza & Estética, Alimentação & Delivery, Serviços Locais).
- **Feedback Visual Claro:**
  - Badge colorido de **Probabilidade de Fechar** (Verde para 75%+, Âmbar para 45-74%, Cinza para <45%).
  - Badge de **Satisfação dos Clientes** mantido e realçado.
  - Ordenação imediata do maior para o menor potencial.
  - Botão "Limpar busca" com 1 clique para voltar à ordenação padrão de Oportunidade.

---

## 3. Arquitetura e Integração com Laya (PR #9)

```
Navegador (Aba Prospecção)
   │
   ├─ Digita ou clica em chip de busca natural
   │
   ▼
POST /api/prospecting/rank
   │
   ├─ Recebe: query (string), leadIds? (opcional)
   ├─ Busca os leads e os valores das colunas IA (lead_column_values do PR #9)
   │
   ├─ Se Laya estiver acessível (LAYA_URL local ou configurada):
   │     └─ Chama layaBatch com instrução baseada na query do usuário
   │     └─ Extrai probabilidade e confiança semântica da IA local
   │
   ├─ Se Laya estiver offline/indisponível:
   │     └─ Aplica fallback determinístico inteligente (combina colunas IA existentes + rating + website + phone)
   │
   ▼
Retorna lista classificada com:
   - lead_id
   - probability (0 a 100)
   - probability_level ('alta' | 'media' | 'baixa')
   - reasons (motivos resumidos do cálculo)
```

### Reaproveitamento das Colunas do PR #9

O cálculo da probabilidade de fechar negócio leva em conta os valores já processados da Planilha Preditiva:
- Se houver coluna tipo `score` ("Parece ter dinheiro"), valor `alto` eleva o peso da probabilidade.
- Se houver coluna tipo `choice` ("Nicho: beleza, saúde..."), match com a query do usuário eleva a pontuação.
- Se houver coluna tipo `noul` ("Tem site?"), respostas alinhadas com a dor do produto pesquisado aumentam a probabilidade.

---

## 4. Estrutura de Arquivos e Componentes

1. `src/lib/prospecting/dynamic-search.ts`:
   - Lógica de extração de regiões e categorias dos leads.
   - Algoritmo de cálculo de probabilidade de fechamento combinando Laya + colunas IA + satisfação.
   - Testes unitários em `src/lib/prospecting/dynamic-search.test.ts`.

2. `src/app/api/prospecting/rank/route.ts`:
   - Endpoint autenticado com `requireRole` para receber a query e retornar o ranking dos leads.
   - Testes de integração em `src/app/api/prospecting/rank/route.test.ts`.

3. `src/components/prospecting/natural-search-bar.tsx`:
   - Barra de busca com debounce, chips rápidos de 1 clique, estado de loading animado e botão limpar.
   - Filtros de Região e Tipo de público responsivos.

4. `src/app/(dashboard)/prospeccao/page.tsx`:
   - Integração da barra e filtros na interface.
   - Nova coluna/badge de "Probabilidade de fechar" na tabela quando a busca dinâmica estiver ativa.
   - Reordenação automática do maior para o menor.
