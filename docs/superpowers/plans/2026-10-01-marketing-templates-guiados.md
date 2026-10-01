# Plano de Implementação: Templates Guiados para Vídeos de Marketing

**Data:** 2026-10-01  
**Spec de referência:** `docs/superpowers/specs/2026-10-01-marketing-templates-guiados.md`  

---

## Tarefa 1: Módulo de Templates e Composição de Prompt (TDD)
- Criar `src/lib/marketing/templates.test.ts` com testes cobrindo:
  - Listagem dos 4 templates pré-configurados.
  - Composição do prompt para cada template com preenchimento total e parcial de campos.
  - Sanitização de campos vazios ou com espaços.
  - Fallback gracioso se um campo opcional não for preenchido.
- Implementar `src/lib/marketing/templates.ts`.

## Tarefa 2: Componente de Interface `TemplatePicker`
- Criar `src/components/marketing/template-picker.tsx`:
  - Cards selecionáveis para cada template com ícones Lucide (`Tag`, `Sparkles`, `MapPin`, `MessageSquareQuote`).
  - Abas/chips para alternar entre "Modelos Prontos" e "Texto Livre".
  - Formulário com campos guiados específicos para o template ativo.
  - Estilização seguindo o Brandbook Concept Digital (`#0624C7`, `#FCE026`, sem roxo, sem emojis em ícones).

## Tarefa 3: Integração no Formulário do Marketing
- Atualizar `src/app/(dashboard)/marketing/page.tsx`:
  - Integrar `TemplatePicker` no topo do formulário.
  - Se estiver no modo "Modelos Prontos", calcular o prompt usando `composeTemplatePrompt`.
  - Se estiver no modo "Texto Livre", usar a `textarea` existente.
  - Manter o botão "Gerar Vídeo" habilitado se o prompt for gerado ou se houver fotos anexadas.

## Tarefa 4: Validação & Testes
- Rodar `npm test` garantindo 100% de aprovação.
- Rodar `npm run typecheck` e `npm run lint`.
- Validar visualmente no navegador na porta 3006.
