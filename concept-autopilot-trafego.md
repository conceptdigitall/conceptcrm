# Concept Autopilot — Squad de Tráfego Pago com IA (/spec, /break, /plan)

## 1. Especificação (`/spec`)

### Objetivo & Nome do Produto
- **Nome Oficial:** **Concept Autopilot** (*Suíte Autônoma de Conteúdo, Vídeo & Tráfego Pago com IA*).
- **Problema Resolvido:** Empresários locais (barbearias, clínicas, adegas, escritórios, comércios) não sabem configurar campanhas no Gerenciador de Anúncios, cometem erros que bloqueiam contas na Meta ou pausam campanhas boas no 1º dia de oscilação.
- **Solução (v1 — Consultor + Criador Assistido, Zero API Meta):**
  1. **Batismo do Produto:** Interface unificada sob a marca **Concept Autopilot** seguindo o Brandbook da Concept Digital (`#0624C7`, `#FCE026`, `#FFFFFF`, zero roxo).
  2. **Squad de 5 Agentes de Tráfego Pago com IA:**
     - **Agente 1 (Estrategista Local):** Define raio geográfico (3–7 km), orçamento diário ideal (ex.: R$ 15–50/dia), público por nicho e estimativa de conversas no WhatsApp.
     - **Agente 2 (Copywriter de Conversão):** Cria 3 variações de anúncio (*Dor Urgente*, *Prova Social & Autoridade*, *Oferta Direta*) com gancho, corpo, CTA e mensagem rastreada de WhatsApp.
     - **Agente 3 (Laya — Auditora de Políticas Meta & Triagem):** Audita as copies contra palavras de risco de bloqueio na Meta Ads (promessas irreais, garantias absolutas, "antes e depois" sensível), gera Score de Segurança (0–100%) e define a triagem automática no WhatsApp (`noul`, `choice`, `score`).
     - **Agente 4 (Engenheiro de Tracking & CAPI):** Gera o link `wa.me` rastreado por anúncio, parâmetros UTM e checklist de Pixel / API de Conversões (`Contact`/`Lead`).
     - **Agente 5 (Analista de ROI & Saúde do Tráfego):** Avalia métricas reais ou simuladas (Investimento, Cliques, Conversas no WhatsApp, Vendas e Ticket Médio) aplicando os princípios operacionais da Concept (foco em CAC/ROAS, alerta contra pausar anúncio por oscilação de 1 dia).
  3. **Transformar Post/Vídeo em Anúncio em 1 Clique:** Botão direto nas abas `Feed` e `Stories` que converte qualquer post/vídeo aprovado em um plano completo de campanha na subaba `Tráfego IA`, acompanhado do **Guia Visual de 3 Cliques** para o dono ativar sem erro.

---

## 2. Quebra de Tarefas Atômicas (`/break`) — Teto Estrito de 350 LOC

| ID | Tarefa | Arquivos Afetados | Limite LOC | Verificação (`INPUT → OUTPUT → VERIFY`) |
|---|---|---|---|---|
| **T1** | Tipos do Concept Autopilot & Squad de Tráfego | `src/types/index.ts` | < 350 lines section | Tipos `AdAgentRole`, `AdCopyVariation`, `AdPolicyAudit`, `AdTrafficDiagnosis`, `AdCampaignPlan` exportados → `npx tsc --noEmit` |
| **T2** | Motor dos 5 Agentes de Tráfego + Post-to-Ad (TDD) | `src/lib/marketing/ads-squad.ts`, `src/lib/marketing/ads-squad.test.ts` | < 350 LOC cada | Funções dos 5 agentes + auditoria Laya + diagnóstico ROI → `npx vitest run src/lib/marketing/ads-squad.test.ts` |
| **T3** | Endpoint de API do Squad de Tráfego | `src/app/api/marketing/ads-squad/route.ts` | < 150 LOC | `POST /api/marketing/ads-squad` (`generate_plan`, `audit_copy`, `analyze_metrics`) → `npx tsc --noEmit` |
| **T4** | Componentes Visuais dos 5 Agentes e Guia 3 Cliques | `src/components/marketing/ads-agent-cards.tsx`, `src/components/marketing/ads-squad-tab.tsx` | < 350 LOC cada | Renderização do Squad, cópia em 1 clique, Guia 3 Cliques e Simulador ROI → `npx tsc --noEmit` |
| **T5** | Integração 1-Click Post→Anúncio e Batismo Concept Autopilot | `src/components/marketing/marketing-tabs-header.tsx`, `src/components/marketing/feed-tab.tsx`, `src/components/marketing/stories-tab.tsx`, `src/components/marketing/marketing-subtabs-page.tsx` | < 350 LOC cada | Subaba `Tráfego IA` ativa, botão 1-click no Feed/Stories e suite `Concept Autopilot` → `npx vitest run src/lib/marketing/` |

---

## 3. Plano de Execução (`/plan`)

- [x] **Passo 1:** Definir interfaces em `src/types/index.ts`.
- [x] **Passo 2:** Implementar `src/lib/marketing/ads-squad.ts` e validar com `src/lib/marketing/ads-squad.test.ts`.
- [x] **Passo 3:** Criar rota `src/app/api/marketing/ads-squad/route.ts`.
- [x] **Passo 4:** Criar `src/components/marketing/ads-agent-cards.tsx` e `src/components/marketing/ads-squad-tab.tsx` respeitando o teto de 350 linhas.
- [x] **Passo 5:** Integrar a aba `Tráfego IA`, batizar o cabeçalho como **Concept Autopilot** e adicionar o botão "Virar Anúncio (1 Clique)" no Feed e Stories.
- [x] **Passo 6:** Rodar suíte de testes (`vitest`), `tsc --noEmit`, checar contagem de linhas (`wc -l`) e salvar `/checkpoint` + `/aprendizado`.
