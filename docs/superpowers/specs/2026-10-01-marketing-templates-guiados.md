# Spec: Templates Guiados para Vídeos de Marketing (CRM Concept)

**Data:** 2026-10-01  
**Autor:** Concept Digital  
**Status:** Aprovado  

---

## 1. Problema & Visão

A aba de Marketing do CRM gera vídeos curtos (15–25s) profissionais usando IA (Claude + HyperFrames). No entanto, clientes leigos muitas vezes travam diante de uma caixa de texto em branco ("Briefing e copy do vídeo"), sem saber o que escrever ou como estruturar uma oferta que converta.

## 2. Solução

Adicionar uma interface com **Modelos Prontos Guiados (Opção 2)**:
1. O usuário escolhe entre 4 tipos de vídeos comprovados de alta conversão.
2. Cada modelo apresenta de 2 a 4 campos simples e diretos (ex.: "Qual o serviço?", "Qual o preço?", "Tem prazo?").
3. A aplicação monta nos bastidores uma copy profissional estruturada (Gancho + Proposta de Valor + Chamada para Ação).
4. O usuário anexa suas fotos normalmente e clica em "Gerar Vídeo" sem precisar saber o que é um prompt de IA.
5. Permite alternar a qualquer momento para o modo "Texto Personalizado" (para usuários avançados).

---

## 3. Os 4 Modelos Pré-configurados

### A. Oferta Relâmpago / Desconto
- **Objetivo:** Estimular compra rápida e preenchimento de agenda.
- **Campos:**
  - `item`: Produto ou Serviço (ex.: "Corte + Barboterapia")
  - `price`: Preço ou Desconto (ex.: "R$ 49,90" ou "30% OFF")
  - `deadline`: Prazo ou Condição (ex.: "Apenas nesta quinta e sexta")
  - `cta`: Chamada para ação (ex.: "Agende agora pelo WhatsApp")
- **Prompt Gerado:** Estrutura de urgência com destaque para o valor promocional e escassez.

### B. Destaque de Produto ou Serviço
- **Objetivo:** Valorizar a qualidade técnica e os benefícios do serviço.
- **Campos:**
  - `name`: Nome do Produto ou Serviço (ex.: "Loiro Platinado Perfeito")
  - `benefit`: Principal diferencial ou benefício (ex.: "Sem agredir os fios, com nutrição intensiva")
  - `target`: Para quem é indicado (ex.: "Para quem quer transformar o visual com segurança")
  - `cta`: Chamada para ação (ex.: "Clique no link e consulte horários disponíveis")

### C. Conheça Nosso Espaço (Institucional)
- **Objetivo:** Gerar credibilidade, acolhimento e atrair clientes para o ponto físico.
- **Campos:**
  - `businessName`: Nome da Empresa (ex.: "Concept Hair Studio")
  - `highlights`: Diferenciais do espaço (ex.: "Ambiente climatizado, café especial e atendimento exclusivo")
  - `location`: Localização / Endereço (ex.: "Av. Ana Costa, 150 - Gonzaga, Santos")
  - `cta`: Chamada para ação (ex.: "Venha nos visitar ou agende sua visita")

### D. Prova Social & Avaliação
- **Objetivo:** Usar a opinião de clientes reais para acelerar a decisão de novos leads.
- **Campos:**
  - `feedback`: Depoimento ou elogio do cliente (ex.: "O melhor corte da minha vida, atendimento impecável!")
  - `clientName`: Nome do cliente ou fonte (ex.: "Cliente satisfeito no Google Reviews 5 estrelas")
  - `service`: Serviço realizado (ex.: "Corte Degradê + Barba")
  - `cta`: Chamada para ação (ex.: "Experimente você também no WhatsApp")

---

## 4. Arquitetura Técnica

1. **Módulo Utilitário Puro (`src/lib/marketing/templates.ts`):**
   - Definição dos tipos `MarketingTemplateId`, `TemplateField`, `MarketingTemplate`.
   - Constante `MARKETING_TEMPLATES` com os 4 modelos.
   - Função pura `composeTemplatePrompt(templateId, values)` com testes unitários em `src/lib/marketing/templates.test.ts`.

2. **Componente de UI (`src/components/marketing/template-picker.tsx`):**
   - Cards visuais interativos com tokens Concept Digital (sem emojis nos ícones, SVGs da Lucide).
   - Abas comutáveis: "Modelos Prontos" (Default) e "Texto Livre".
   - Inputs organizados com labels e placeholders realistas.

3. **Integração na Página (`src/app/(dashboard)/marketing/page.tsx`):**
   - O formulário submete o prompt composto automaticamente ou o texto livre digitado.
