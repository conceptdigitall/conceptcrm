# Plano de Implementação: Agendamento Inteligente com Google Calendar + Atendente de IA no WhatsApp

**Data:** 01/10/2026  
**Status:** Pronto para Execução  
**Autor:** Antigravity (Concept Digital)  
**Projeto:** CRM Concept (`wacrm`)  

---

## 📋 Lista de Tarefas (Breakdown com TDD)

### Fase 1: Mapeamento de Regras e Motor de Disponibilidade (`lib/calendar`)
- [ ] **Tarefa 1 (TDD):** Implementar utilitário de horários e regras comerciais em `src/lib/calendar/rules.ts`
  - Horários: Seg a Sáb, 09:00 às 18:00 (horário de Brasília).
  - Almoço: 12:00 às 13:00 bloqueado.
  - Slots flexíveis de 30 min, 45 min e 60 min.
  - Cálculo de intervalos disponíveis a partir de lista de compromissos ocupados.
  - Seleção de 2 a 3 horários sugeridos (1 manhã, 2 tarde).
  - *Testes em `src/lib/calendar/rules.test.ts`*.

- [ ] **Tarefa 2 (TDD):** Implementar leitor de iCal privado do Google Calendar em `src/lib/calendar/ical.ts`
  - Parser leve e robusto para arquivos `.ics` do Google Calendar.
  - Extração de eventos ocupados no período solicitado.
  - *Testes em `src/lib/calendar/ical.test.ts`*.

- [ ] **Tarefa 3 (TDD):** Implementar cliente Google Calendar API (Service Account & Fallbacks) em `src/lib/calendar/google.ts`
  - Métodos: `fetchBusyIntervals()`, `createEvent()`, `generateMeetUrl()`.
  - Tratamento resiliente de ausência de credenciais (fallback gracioso para Supabase).
  - *Testes em `src/lib/calendar/google.test.ts`*.

---

### Fase 2: Banco de Dados e API do CRM
- [ ] **Tarefa 4:** Criar migration `047_appointments_google_calendar.sql`
  - Adicionar colunas `google_event_id TEXT`, `google_calendar_id TEXT` e `synced_at TIMESTAMPTZ` na tabela `appointments`.
  - Índices para performance em consultas por data e status.

- [ ] **Tarefa 5 (TDD):** Rota de consulta de disponibilidade `GET /api/calendar/availability`
  - Recebe `date` (YYYY-MM-DD), `duration` (minutos).
  - Combina compromissos do Supabase (`appointments`) + Google Calendar.
  - Retorna slots disponíveis e as 3 melhores sugestões.
  - *Testes em `src/app/api/calendar/availability/route.test.ts`*.

- [ ] **Tarefa 6 (TDD):** Rota de sincronização e criação `POST /api/calendar/events`
  - Criação no Google Calendar e espelhamento no Supabase.
  - *Testes em `src/app/api/calendar/events/route.test.ts`*.

---

### Fase 3: Agente de IA no WhatsApp (`evolution-webhook`)
- [ ] **Tarefa 7 (TDD):** Adicionar ferramenta `check_availability` no Claude em `src/app/api/whatsapp/evolution-webhook/route.ts`
  - Schema da tool com `date` e `time_preference`.
  - Execução da busca de slots e formatação da resposta com 2 a 3 horários.
  - Prompt atualizado com as diretrizes do Lobo-Guará e formato sem markdown.
  - *Testes em `src/app/api/whatsapp/evolution-webhook/calendar-tools.test.ts`*.

- [ ] **Tarefa 8 (TDD):** Evoluir ferramenta `schedule_appointment` para sincronizar no Google Calendar
  - Criação no Google Calendar com Google Meet.
  - Gravação de `google_event_id` no Supabase.
  - Atualização do contato e envio de aviso aos sócios no WhatsApp.
  - *Testes integrados de execução da tool*.

---

### Fase 4: Interface do Usuário na Aba de Agendamentos (`/appointments`)
- [ ] **Tarefa 9:** Componente de Status da Integração Google Calendar
  - Card visual elegante informando se a agenda está sincronizada (Google Calendar / iCal / Supabase).
  - Informações de horário comercial e almoço.
  - Botão de sincronização manual.

- [ ] **Tarefa 10:** Melhorias nos Cards e Tabela de Agendamentos
  - Badge visual de evento sincronizado com o Google Calendar.
  - Botão de 1 clique para entrar no Google Meet (`meeting_url`).
  - Link direto para abrir o evento no Google Agenda.

---

### Fase 5: Validação, Verificação e Documentação
- [ ] **Tarefa 11:** Execução da suíte completa de testes (`npm test`, `typecheck`, `lint`).
- [ ] **Tarefa 12:** Atualização do segundo cérebro em `wiki/crm-concept.md` e registro em `aprendizados/`.
