# Spec: Aba de Prospecção Vertical por Nicho (CRM Concept)

**Data:** 2026-10-07  
**Autor:** Concept Digital  
**Status:** Aprovado  
**Branch Alvo:** `feat/prospeccao-vertical-nichos`

---

## 1. Problema & Visão

Hoje, a aba de Prospecção do CRM Concept opera com raspagem fria do Google Maps (Docker + worker + Laya) voltada para a prospecção interna da própria Concept Digital.

Para os **CRMs Verticais** entregues aos clientes finais (advogados, clínicas, fotógrafos, barbeiros, e-commerce, imobiliárias):
1. **O cliente não pode depender de Docker/Maps Scraper:** viola termos do Google, exige infraestrutura pesada no Mac e não reflete como o cliente final capta clientes.
2. **O cliente precisa de prospecção nativa do seu setor:**
   - **Radar de Reativação da Base (Opção 1):** prospectar clientes inativos que já compraram ou agendaram no passado e estão no momento de retorno.
   - **Importação Inteligente de Planilhas/CSV (Opção 3):** subir bases legadas de clientes/leads em lote, higienizando telefones e evitando duplicatas.
   - **Playbooks Guiados de Mensagem:** o mesmo padrão de sucesso da aba Marketing (templates prontos guiados com campos simples, variáveis de personalização, preview da copy e 1-clique para WhatsApp, com aba de texto livre para avançados).

---

## 2. Nichos & Regras de Negócio

A aba se adapta automaticamente de acordo com o nicho configurado no CRM (`niche`):

| Nicho | Ciclo Médio de Reativação | Foco do Playbook Guiado | Tom da Mensagem |
|---|---|---|---|
| **Advogados (`advogado`)** | 180 dias | Consulta Preventiva, Informativo de Decisão Recente, Triagem | Formal, consultivo, 100% aderente ao Código de Ética da OAB |
| **Clínicas (`clinica`)** | 90 a 180 dias | Resgate de Orçamento, Check-up Preventivo, Avaliação de Procedimento | Humanizado, atencioso, técnico |
| **Fotógrafos (`fotografo`)** | 60 a 120 dias | Ensaio Família/Anual, Mini-sessão Sazonal (Mães/Natal), Formatura | Afetivo, estético, celebrativo |
| **Barbeiros (`barbeiro`)** | 21 a 28 dias | Régua do Fim de Semana, Resgate de Sumido, Combo Barba+Corte | Direto, descontraído, brother |
| **E-commerce (`ecommerce`)** | 30 a 60 dias | Recuperação de Carrinho, Recompra de Estoque Pessoal, Cupom VIP | Ágil, orientado a benefício e conveniência |
| **Imobiliárias (`imobiliaria`)** | 60 dias | Imóvel Compatível, Avaliação de Mercado, Investimento | Seguro, patrimonial, exclusivo |

---

## 3. Os 2 Canais de Entrada Prioritários

### A. Radar de Reativação da Base (Opção 1)
- **Origem dos dados:** Consulta nativa nos contatos (`contacts`) e agendamentos/negócios passados.
- **Lógica de Inatividade:**
  - `dias_sem_interacao >= limiar_nicho` (configurável na UI: 21 dias para barbeiros, 90 para clínicas/fotógrafos, 180 para advogados).
  - Filtro para ignorar contatos com mensagens ativas nos últimos 7 dias.
- **Apresentação:** Card ou tabela destacada com o badge *"Pronto para Reativar"*, data da última visita/corte/atendimento e botão de ação direta para o Playbook.

### B. Importação Inteligente de Planilhas/CSV (Opção 3)
- **Fluxo do Usuário:**
  1. O usuário arrasta um arquivo `.csv` ou `.xlsx` (ou cola linhas de tabela).
  2. Mapeamento visual simples de colunas: `Nome`, `Telefone/WhatsApp`, `Último Serviço / Data` (opcional).
  3. Sanitização automática do telefone (E.164 / padrão brasileiro DDD + 9 dígitos).
  4. Deduplicação automática: contatos que já existem na base são atualizados ou marcados sem duplicar.
  5. Os contatos importados entram diretamente no radar de prospecção prontos para abordagem.

---

## 4. Playbooks Guiados de Mensagem (Padrão Aba Marketing)

Seguindo exatamente o design system de templates guiados validado na aba Marketing:

### Componentes & UX:
1. **Modal / Gaveta `PlaybookModal`:**
   - Abas: `Modelos Prontos` (Padrão) e `Texto Livre`.
   - Grid de Cards com ícones Lucide elegantes (sem emojis).
   - Ao selecionar o modelo, aparecem 2 a 4 campos guiados (ex.: *Nome do Cliente*, *Serviço/Tratamento*, *Condição/Horário*).
2. **Preview em Tempo Real da Mensagem:**
   - Caixa com a copy formatada em tempo real conforme o usuário digita.
3. **Ações em 1 Clique:**
   - Botão primário: `💬 Abrir no WhatsApp` (gera link universal `https://wa.me/...`).
   - Botão secundário: `📋 Copiar Mensagem`.
   - Botão terciário: `✓ Marcar como Contatado` (atualiza o status no CRM).

---

## 5. Arquitetura Técnica & Arquivos

```
wacrm/
├── src/
│   ├── config/
│   │   └── niches.ts                      # Configurações e metadados por nicho (advogado, clínica, etc.)
│   ├── lib/
│   │   ├── prospecting/
│   │   │   ├── playbooks.ts               # Tipos e geradores de copy por nicho
│   │   │   ├── playbooks.test.ts          # Testes unitários com Vitest
│   │   │   ├── reactivation.ts            # Cálculo de clientes inativos por nicho
│   │   │   ├── reactivation.test.ts       # Testes da regra de inatividade
│   │   │   ├── csv-importer.ts            # Parser, normalização E.164 e deduplicação
│   │   │   └── csv-importer.test.ts       # Testes do importador
│   └── components/
│       └── prospecting/
│           ├── reactivation-radar.tsx     # Card/Lista do radar de reativação
│           ├── csv-import-modal.tsx       # Modal de upload drag & drop e mapeamento
│           ├── playbook-picker-modal.tsx  # Seletor de templates guiados de copy
│           └── vertical-prospecting.tsx   # Orquestrador da aba de prospecção vertical
```

---

## 6. Critérios de Aceite (Definition of Done)

1. Teto de 350 linhas respeitado em todos os novos arquivos.
2. 100% de testes unitários passando nos utilitários de playbooks, reativação e parser CSV.
3. Não quebra a prospecção interna existente da Concept (o scraper Maps continua existindo para a agência).
4. Suporte aos 6 nichos com cópias contextualizadas e realistas.
5. Interface 100% responsiva (Mobile First e Desktop).
