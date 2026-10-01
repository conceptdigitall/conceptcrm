# Especificação Técnica: Agendamento Inteligente com Google Calendar + Atendente de IA no WhatsApp

**Data:** 01/10/2026  
**Status:** Planejamento / Proposta  
**Autor:** Antigravity (Concept Digital)  
**Projeto:** CRM Concept (`wacrm`)  

---

## 1. Visão Geral e Objetivo

Permitir que o agente de IA da Concept Digital no WhatsApp atenda leads e clientes, consulte a disponibilidade real da agenda (Segunda a Sábado, das 09h às 18h, exceto almoço 12h-13h), sugira ativamente 2 a 3 horários livres e realize o agendamento completo, sincronizando de forma bidirecional com o CRM Concept (Supabase) e com o Google Calendar (com link do Google Meet).

Na interface do CRM (`/appointments`), os usuários podem visualizar os eventos sincronizados, o status da conexão da agenda e gerenciar os agendamentos.

---

## 2. Regras de Negócio e Parâmetros

1. **Horário de Funcionamento:**
   - Dias: Segunda a Sábado.
   - Janela: 09:00 às 18:00 (Fuso horário `America/Sao_Paulo`).
   - Almoço: 12:00 às 13:00 (horário reservado, nunca sugerido pela IA).
   - Domingos: Fechado para agendamentos.

2. **Duração das Reuniões:**
   - Padrão: 30 minutos (sessão de diagnóstico e demonstração de ativos digitais).
   - Flexibilidade: Suporte a durações de 30 min, 45 min ou 60 min.

3. **Sugestão de Horários pela IA (Estratégia Anti-Fricção):**
   - Ao receber o pedido de agendamento ou pergunta de disponibilidade ("Tem horário na quinta?", "Como faço para agendar?"), a IA aciona a ferramenta `check_availability`.
   - A ferramenta calcula os intervalos livres e seleciona de 2 a 3 opções estratégicas (ex: uma pela manhã e duas à tarde).
   - A IA responde de forma natural, curta (2 a 3 frases), sofisticada e sem markdown/asteriscos:
     > *"Consultei a nossa agenda aqui: na quinta-feira temos horários livres às 10h, às 14h30 e às 16h. Qual desses fica melhor para você?"*

4. **Confirmação e Criação do Agendamento:**
   - Quando o lead escolher ou confirmar o horário, a IA aciona `schedule_appointment`.
   - Ação da ferramenta:
     1. Valida se o horário ainda está livre (prevenção contra conflitos).
     2. Cria o evento no Google Calendar (com Google Meet) via Service Account, Link iCal / Webhook ou integração direta.
     3. Insere o registro na tabela `appointments` no Supabase com status `confirmed`, `meeting_url` e `google_event_id`.
     4. Atualiza os dados do contato (`name`, `company`, `email`) e insere o resumo em `contact_notes`.
     5. Notifica imediatamente os diretores/sócios da Concept no WhatsApp com resumo executivo, contagem regressiva e link da sala.
     6. Retorna mensagem de confirmação para o lead no WhatsApp com o link do Google Meet e botão de adicionar à agenda.

---

## 3. Arquitetura de Conexão com Google Calendar (Resiliente e Sem Bloqueios)

Como o João possui uma pendência cadastral na conta pessoal do Google Cloud que impede a criação de novas contas ou faturamento, a arquitetura foi desenhada com **três camadas de compatibilidade**:

1. **Camada A — Service Account Oficial (Google Cloud):**
   - Suporte completo a `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` e `GOOGLE_CALENDAR_ID`.
   - Pode ser ativada usando a conta da agência (`sacconceptdigital@gmail.com`) ou um JSON existente do BarberSaas/projeto anterior sem custo algum.

2. **Camada B — Integração Nativa via iCal Privado (Zero Google Cloud):**
   - Todo Google Calendar possui um endereço privado iCal (`https://calendar.google.com/calendar/ical/.../basic.ics`).
   - O CRM faz o parse do arquivo iCal em tempo real para saber todos os horários que o João já tem ocupados na agenda pessoal/profissional, garantindo que a IA nunca marque nada por cima de compromissos existentes!
   - 100% gratuito, sem depender de Google Cloud ou permissões de desenvolvedor.

3. **Camada C — Webhook para n8n (Stack Concept Digital):**
   - Disparo opcional de webhook para workflows no n8n (ex: `GOOGLE_CALENDAR_WEBHOOK_URL`), onde o n8n utiliza o nó padrão do Google Calendar com OAuth simples já conectado.

4. **Camada D — Fallback Local (Supabase):**
   - Caso nenhuma integração externa esteja configurada no momento, o CRM valida a disponibilidade contra os agendamentos registrados no próprio banco (`appointments`), garantindo que o bot nunca quebre ou deixe de responder.

---

## 4. Modelagem de Dados (Supabase Migration)

Adição de colunas na tabela `appointments`:
- `google_event_id TEXT`: Identificador único do evento no Google Calendar para permitir atualizações/cancelamentos futuros.
- `google_calendar_id TEXT`: ID do calendário utilizado.
- `synced_at TIMESTAMPTZ`: Timestamp da última sincronização com o Google Calendar.

---

## 5. Endpoints de API e Rotas

- `GET /api/calendar/availability?date=YYYY-MM-DD&duration=30`:
  - Retorna os slots disponíveis para o dia solicitado, filtrando horários ocupados (Google Calendar + Supabase), respeitando horário de almoço e dias de funcionamento.
- `POST /api/calendar/events`:
  - Cria um evento diretamente no Google Calendar e no Supabase.
- `POST /api/calendar/sync`:
  - Força a sincronização entre Google Calendar e Supabase na aba `/appointments`.

---

## 6. Telas e Componentes UI (`/appointments`)

1. **Card de Status da Integração Google Calendar:**
   - Mostra status: `Conectado via Service Account`, `Conectado via iCal`, ou `Modo Local (Supabase)`.
   - Botão para testar conexão / sincronizar.
2. **Badges de Sincronização na Lista de Agendamentos:**
   - Ícone do Google Agenda com indicação se o evento está sincronizado.
   - Botão de acesso direto ao Google Meet e ao Google Calendar.
3. **Modal de Configuração da Agenda:**
   - Permite definir ou ajustar horário de início (09h), fim (18h), almoço (12h-13h) e duração padrão.
