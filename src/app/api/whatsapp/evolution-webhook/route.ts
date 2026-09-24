import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

// Inicializa Supabase com as variáveis de ambiente já existentes no seu projeto
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-0d4c.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'concept_master_evolution_2026';
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'concept-atendimento';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulateHumanPresence(remoteJid: string, delayMs: number) {
  try {
    const cleanNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
    await fetch(`${EVOLUTION_URL}/chat/markMessageAsRead/${INSTANCE}`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        readMessages: [{ remoteJid, fromMe: false, id: '' }],
      }),
    });

    await fetch(`${EVOLUTION_URL}/chat/sendPresence/${INSTANCE}`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: cleanNumber,
        presence: 'composing',
        delay: delayMs,
      }),
    });
  } catch (err) {
    console.error('[Evolution Presence Error]:', err);
  }
}

async function sendEvolutionMessage(number: string, text: string) {
  let cleanNumber = number.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
  if (cleanNumber.length >= 10 && cleanNumber.length <= 11 && !cleanNumber.startsWith('55')) {
    cleanNumber = '55' + cleanNumber;
  }
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: cleanNumber, text }),
  });
  return res.json();
}

/**
 * Resolve o account_id e user_id do CRM (multi-tenant)
 * Busca primeiro no whatsapp_config, com fallback para o primeiro account ativo.
 */
async function getAccountAndUser(): Promise<{ accountId: string; userId: string }> {
  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('account_id, user_id')
    .limit(1)
    .maybeSingle();

  if (config?.account_id && config?.user_id) {
    return { accountId: config.account_id, userId: config.user_id };
  }

  const { data: acc } = await supabase
    .from('accounts')
    .select('id, owner_user_id')
    .limit(1)
    .maybeSingle();

  return {
    accountId: acc?.id || '',
    userId: acc?.owner_user_id || '',
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. FILTRO: Ignora se o evento não for estritamente nova mensagem
    if (body.event !== 'messages.upsert' && body.event !== 'MESSAGES_UPSERT') {
      return NextResponse.json({ status: 'ignored_not_upsert' });
    }

    const data = body.data;
    const key = data?.key;

    // 2. FILTRO ANTI-LOOP: Ignora qualquer mensagem enviada por você ou pelo bot
    if (key?.fromMe) {
      return NextResponse.json({ status: 'ignored_from_me' });
    }

    // Ignora mensagens de grupos ou status broadcast
    const remoteJid = key?.remoteJid || '';
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
      return NextResponse.json({ status: 'group_ignored' });
    }

    // 3. FILTRO DE NÚMERO GENÉRICO/TESTE (Ex: 99999-0099)
    const rawNumberDigits = (key?.remoteJid || '').replace(/\D/g, '');
    const isFakeNumber = 
      rawNumberDigits.includes('999990099') || 
      rawNumberDigits.length < 10 || 
      rawNumberDigits.startsWith('0000');

    if (isFakeNumber) {
      console.warn(`[Segurança] Disparo bloqueado para número teste/inválido: ${rawNumberDigits}`);
      return NextResponse.json({ status: 'blocked_fake_number' });
    }

    // 4. FILTRO DE CONTEÚDO VAZIO
    const messageText =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      '';

    if (!messageText.trim()) {
      return NextResponse.json({ status: 'ignored_empty_text' });
    }

    // 5. Extrair número limpo tratando variações de JID (@s.whatsapp.net, @lid)
    let rawNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
    if (remoteJid.endsWith('@lid') && data?.participant) {
      const altNumber = String(data.participant).replace('@s.whatsapp.net', '').replace('@lid', '');
      if (altNumber) rawNumber = altNumber;
    }
    const senderNumber = rawNumber.replace(/\D/g, '') || rawNumber;
    const senderName = data?.pushName || 'Novo Lead';

    console.log(`[Nova Mensagem] ${senderName} (${senderNumber}): ${messageText}`);

    // ========================================================
    // 1. GRAVAR NO BANCO DO CRM (SUPABASE) PARA MOSTRAR NA INBOX
    // ========================================================
    const { accountId, userId } = await getAccountAndUser();

    // 2. Localizar ou criar o contato de forma segura
    let contact: { id: string } | null = null;
    const { data: initialContact, error: contactErr } = await supabase
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone', senderNumber)
      .maybeSingle();
    contact = initialContact;

    if (contactErr) {
      console.warn('[Evolution Webhook] Aviso ao consultar contato:', contactErr.message);
      const { data: fallbackContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', senderNumber)
        .maybeSingle();
      contact = fallbackContact;
    }

    if (!contact) {
      const { data: createdContact, error: insertContactErr } = await supabase
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: userId,
          name: senderName,
          phone: senderNumber,
        })
        .select('id')
        .maybeSingle();

      if (insertContactErr) {
        console.error('[Evolution Webhook] Erro ao criar contato novo:', insertContactErr);
        // Em caso de concorrência simultânea, recupera o contato inserido
        const { data: retryContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone', senderNumber)
          .maybeSingle();
        contact = retryContact;
      } else {
        contact = createdContact;
      }
    }

    // 3. Localizar ou criar a conversa (conversation) para aparecer na Inbox
    let conversationId: string | null = null;
    if (contact?.id) {
      const { data: conv, error: convFetchErr } = await supabase
        .from('conversations')
        .select('id, unread_count')
        .eq('account_id', accountId)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (convFetchErr) {
        console.warn('[Evolution Webhook] Aviso ao consultar conversa:', convFetchErr.message);
      }

      const nowIso = new Date().toISOString();

      if (!conv) {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({
            account_id: accountId,
            user_id: userId,
            contact_id: contact.id,
            status: 'open',
            last_message_text: messageText,
            last_message_at: nowIso,
            unread_count: 1,
          })
          .select('id')
          .maybeSingle();

        if (convErr) {
          console.error('[Evolution Webhook] Erro ao criar conversation:', convErr);
          const { data: retryConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          conversationId = retryConv?.id ?? null;
        } else {
          conversationId = newConv?.id ?? null;
        }
      } else {
        conversationId = conv.id;
        await supabase
          .from('conversations')
          .update({
            status: 'open',
            last_message_text: messageText,
            last_message_at: nowIso,
            unread_count: (conv.unread_count || 0) + 1,
            updated_at: nowIso,
          })
          .eq('id', conv.id);
      }

      // 4. Salvar a mensagem na conversa criada com upsert
      if (conversationId) {
        const messageId = key?.id || null;

        const { data: insertedRows, error: msgErr } = await supabase
          .from('messages')
          .upsert(
            {
              conversation_id: conversationId,
              message_id: messageId,
              content_text: messageText,
              content_type: 'text',
              sender_type: 'customer',
              status: 'delivered',
            },
            { onConflict: 'conversation_id,message_id', ignoreDuplicates: true }
          )
          .select('id');

        if (msgErr) {
          console.error('[Evolution Webhook] Erro ao salvar mensagem do cliente:', msgErr);
        }

        // Se a mensagem já existia (replay/retentativa da Evolution API), encerra sem duplicar resposta
        if (messageId && (!insertedRows || insertedRows.length === 0)) {
          console.info('[Evolution Webhook] Mensagem duplicada ignorada (idempotente):', messageId);
          return NextResponse.json({ status: 'duplicate_ignored' });
        }
      }
    }

    // ========================================================
    // 2. REGRAS HUMANAS & RESPOSTA INTELIGENTE (CLAUDE)
    // ========================================================
    // Delay otimizado para presença humana sem estourar timeout da Vercel (3 a 6 segundos)
    const randomDelay = Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000;
    await simulateHumanPresence(remoteJid, randomDelay);

    const [replyText] = await Promise.all([
      generateClaudeReply({
        userName: senderName,
        userMessage: messageText,
        senderPhone: senderNumber,
        contactId: contact?.id,
        accountId,
        userId,
        conversationId,
      }),
      sleep(randomDelay)
    ]);

    if (replyText) {
      // Envia via WhatsApp
      await sendEvolutionMessage(remoteJid, replyText);

      // Salva a resposta da IA no CRM também
      if (conversationId) {
        const { error: botMsgErr } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          content_text: replyText,
          content_type: 'text',
          sender_type: 'bot',
          status: 'sent',
        });

        if (botMsgErr) {
          console.error('[Evolution Webhook] Erro ao salvar mensagem do bot:', botMsgErr);
        }

        await supabase
          .from('conversations')
          .update({
            last_message_text: replyText,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Evolution Webhook Error]:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

interface GenerateReplyParams {
  userName: string;
  userMessage: string;
  senderPhone?: string;
  contactId?: string | null;
  accountId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
}

/**
 * Calcula a contagem regressiva em dias civis (fuso de Brasília)
 * até a data da reunião agendada.
 */
function getDaysUntil(targetDate: Date): { days: number; label: string; textDesc: string } {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };

  const toDateOnly = (d: Date) => {
    const parts = new Intl.DateTimeFormat('pt-BR', options).formatToParts(d);
    const day = parts.find((p) => p.type === 'day')?.value || '01';
    const month = parts.find((p) => p.type === 'month')?.value || '01';
    const year = parts.find((p) => p.type === 'year')?.value || '2026';
    return new Date(`${year}-${month}-${day}T00:00:00-03:00`);
  };

  const dNow = toDateOnly(now);
  const dTarget = toDateOnly(targetDate);
  const diffMs = dTarget.getTime() - dNow.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return { days, label: '🚨 *É HOJE!*', textDesc: 'é hoje' };
  } else if (days === 1) {
    return { days, label: '⏳ *Falta 1 dia (amanhã)*', textDesc: 'falta 1 dia (amanhã)' };
  } else if (days > 1) {
    return { days, label: `⏳ *Faltam ${days} dias*`, textDesc: `faltam ${days} dias` };
  } else if (days === -1) {
    return { days, label: '⚠️ Data passada (ontem)', textDesc: 'ontem' };
  } else {
    return { days, label: `⚠️ Data passada (${Math.abs(days)} dias atrás)`, textDesc: `${Math.abs(days)} dias atrás` };
  }
}

/**
 * Gera URL universal para adicionar evento ao Google Calendar com 1 clique
 */
function generateGoogleCalendarUrl({
  title,
  startDate,
  durationMinutes = 30,
  details,
  location,
}: {
  title: string;
  startDate: Date;
  durationMinutes?: number;
  details?: string;
  location?: string;
}): string {
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

  const formatUtcGCal = (d: Date) => {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const dates = `${formatUtcGCal(startDate)}/${formatUtcGCal(endDate)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details: details || '',
    location: location || 'https://meet.google.com/new',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Retorna os números de WhatsApp dos diretores/sócios para receberem avisos imediatos
 */
function getAdminNotificationNumbers(): string[] {
  const defaultNumbers = ['5513978071057', '5513982292700'];
  const envVal = process.env.ADMIN_WHATSAPP_NUMBERS;
  const customList = envVal
    ? envVal.split(',').map((n) => n.trim().replace(/\D/g, '')).filter(Boolean)
    : [];

  const combined = Array.from(new Set([...defaultNumbers, ...customList]));
  return combined.map((n) => {
    return n.length >= 10 && n.length <= 11 && !n.startsWith('55') ? '55' + n : n;
  });
}

async function generateClaudeReply({
  userName,
  userMessage,
  senderPhone,
  contactId,
  accountId,
  userId,
  conversationId,
}: GenerateReplyParams): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Evolution Webhook] ANTHROPIC_API_KEY não configurada no .env.local');
    return '';
  }

  const nowBrasilia = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  const systemPrompt = `
Você é a inteligência executiva de atendimento da Concept Digital (Engenharia de vendas, design e soluções em software).
Você atende empresários, médicos, advogados e gestores de alto padrão que chegam via WhatsApp.
Data e hora de referência atual: ${nowBrasilia}.

DIRETRIZES DA MARCA E POSICIONAMENTO:
- Propósito: Elevar o posicionamento digital de negócios premium através de engenharia de vendas e design funcional.
- Posicionamento: Parceiros estratégicos de tecnologia e crescimento, não uma agência operacional comum.
- Estilo e Arquétipo: Inspirado na postura do Lobo-Guará — ágil, silencioso, direto, focado exclusivamente em conversão e resultados.
- Tom de Voz: Direto, suave, maduro e sofisticado. Valorizamos o tempo do lead com respostas objetivas.
- Vocabulário Chave: "Ativos digitais de alto padrão", "Engenharia de vendas", "Conversão", "Solução de gargalos operacionais".
- Termos Proibidos: "Sites super tops", "precinho", "bombar na internet", "baratinho".

PORTFÓLIO DE SOLUÇÕES:
1. Ecossistema Integrado de Conversão (Pacote Principal):
   - Landing Page Premium + CRM Próprio Integrado + Dashboard de Métricas & Tráfego (Meta Ads).
   - Faixa de Investimento Estimada: Entre R$ 1.000,00 e R$ 1.500,00 (sujeito a alinhamento de escopo).
2. Contratações Modulares / Individuais:
   - Landing Page de Alta Conversão: Minimalista, ultra-rápida, foco em conversão.
   - CRM Próprio & Gestão de Leads: Organização de contatos, métricas e eliminação de perda de vendas no WhatsApp.
   - Softwares e Sistemas Sob Demanda: Web Apps, plataformas internas, integrações de APIs e e-commerces.

REGRAS RÍGIDAS DE CONDUTA NO CHAT:
1. Responda SEMPRE em no máximo 2 ou 3 frases curtas. Seja direto, acolhedor e fale como um amigo estratégico de negócios no WhatsApp. NUNCA gere blocos longos de texto nem listas sem solicitação.
2. Gatilho de Conversão: Sempre sugira uma demonstração rápida de 20 minutos por chamada no Google Meet para mostrar na tela como ficaria a estrutura do cliente na prática.
3. Horário de atendimento: Segunda a sexta-feira, das 09h às 18h.
4. Apresentação de Preços: Mencione faixas estimadas de investimento (ex: pacotes a partir de R$ 1.000 a R$ 1.500) com naturalidade e sofisticação, sempre condicionando ao diagnóstico das necessidades específicas do projeto.
5. Sincronização & Agendamento via Tool:
   - Assim que o lead concordar com a demonstração ou indicar um dia e horário comercial (segunda a sexta-feira, das 09h às 18h), acione IMEDIATAMENTE a ferramenta "schedule_appointment".
   - Extraia e passe para os parâmetros da ferramenta tudo o que o cliente tiver mencionado: nome real (client_name), empresa/nicho (client_company), e-mail (client_email), e um breve resumo das necessidades/gargalos (notes).
6. Nome do cliente atual: "${userName}". Use o primeiro nome de forma natural e sutil.
`;

  const tools: Anthropic.Tool[] = [
    {
      name: 'schedule_appointment',
      description: 'Acione esta ferramenta para registrar a reunião/demonstração no CRM, sincronizar dados com o Google Calendar e notificar a diretoria via WhatsApp quando o lead concordar com dia e horário (segunda a sexta-feira, das 09h às 18h).',
      input_schema: {
        type: 'object',
        properties: {
          datetime_iso: {
            type: 'string',
            description: 'Data e hora da reunião no formato ISO 8601 (ex: 2026-09-25T14:00:00-03:00)',
          },
          title: {
            type: 'string',
            description: 'Título da reunião. Padrão: Sessão de Diagnóstico & Demonstração',
          },
          client_name: {
            type: 'string',
            description: 'Nome completo ou primeiro nome informado ou confirmado pelo cliente',
          },
          client_company: {
            type: 'string',
            description: 'Nome da empresa, consultório, clínica, escritório ou nicho do cliente, se mencionado',
          },
          client_email: {
            type: 'string',
            description: 'E-mail do cliente, se fornecido',
          },
          notes: {
            type: 'string',
            description: 'Resumo das dores, gargalos, objetivos de negócio ou escopo mencionado pelo cliente',
          },
        },
        required: ['datetime_iso'],
      },
    },
  ];

  // Recupera histórico recente da conversa para manter contexto fluido
  const chatMessages: Anthropic.MessageParam[] = [];
  if (conversationId) {
    try {
      const { data: history } = await supabase
        .from('messages')
        .select('sender_type, content_text')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(6);

      if (history && history.length > 0) {
        const sorted = history.reverse();
        for (const m of sorted) {
          if (!m.content_text?.trim()) continue;
          const role = m.sender_type === 'customer' ? 'user' : 'assistant';
          if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== role) {
            chatMessages.push({ role, content: m.content_text });
          }
        }
      }
    } catch (hErr) {
      console.warn('[Evolution Webhook] Aviso ao buscar histórico recente:', hErr);
    }
  }

  if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== 'user') {
    chatMessages.push({ role: 'user', content: userMessage });
  } else {
    chatMessages[chatMessages.length - 1] = { role: 'user', content: userMessage };
  }

  // Helper para processar tool calls de agendamento, sincronizar com banco e notificar via WhatsApp
  const processToolCall = async (toolUse: Anthropic.ToolUseBlock): Promise<string> => {
    const input = toolUse.input as {
      datetime_iso?: string;
      title?: string;
      client_name?: string;
      client_company?: string;
      client_email?: string;
      notes?: string;
    };

    const rawIso = input.datetime_iso || new Date().toISOString();
    const scheduledDate = new Date(rawIso);
    const validDate = !isNaN(scheduledDate.getTime()) ? scheduledDate : new Date();
    const meetingUrl = 'https://meet.google.com/new';

    const resolvedClientName = input.client_name?.trim() || (userName !== 'Novo Lead' ? userName : '') || 'Cliente';
    const countdown = getDaysUntil(validDate);

    const formattedDate = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(validDate);

    const clientPhoneDisplay = senderPhone ? `+${senderPhone}` : 'Não informado';

    // 1. Sincronizar dados do Contato no Banco de Dados (Supabase CRM)
    if (contactId) {
      try {
        const contactUpdates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (resolvedClientName && resolvedClientName !== 'Cliente' && resolvedClientName !== 'Novo Lead') {
          contactUpdates.name = resolvedClientName;
        }
        if (input.client_company?.trim()) {
          contactUpdates.company = input.client_company.trim();
        }
        if (input.client_email?.trim()) {
          contactUpdates.email = input.client_email.trim();
        }

        await supabase.from('contacts').update(contactUpdates).eq('id', contactId);

        // 2. Inserir anotação de diagnóstico e contexto no histórico do contato
        if (userId && (input.notes || input.client_company || input.client_email)) {
          const noteLines = [
            `📅 Reunião agendada: ${formattedDate} (${countdown.textDesc})`,
            input.client_company ? `🏢 Empresa/Nicho: ${input.client_company}` : null,
            input.client_email ? `✉️ E-mail: ${input.client_email}` : null,
            input.notes ? `📝 Dores/Escopo: ${input.notes}` : null,
            `🔗 Google Meet: ${meetingUrl}`,
          ]
            .filter(Boolean)
            .join('\n');

          await supabase.from('contact_notes').insert({
            contact_id: contactId,
            user_id: userId,
            note_text: noteLines,
          });
        }

        // 3. Registrar o agendamento na tabela appointments
        const appointmentPayload: Record<string, unknown> = {
          contact_id: contactId,
          title: input.title || `Sessão de Diagnóstico & Demonstração - ${resolvedClientName}`,
          scheduled_at: validDate.toISOString(),
          duration_minutes: 30,
          status: 'confirmed',
          meeting_url: meetingUrl,
          notes: input.notes || null,
        };
        if (accountId) appointmentPayload.account_id = accountId;
        if (userId) appointmentPayload.user_id = userId;

        const { error: insErr } = await supabase.from('appointments').insert(appointmentPayload);
        if (insErr) {
          console.warn('[Evolution Webhook] Aviso ao salvar agendamento:', insErr.message);
        } else {
          console.info(`[Evolution Webhook] Agendamento salvo com sucesso para contato ${contactId}!`);
        }
      } catch (dbErr) {
        console.error('[Evolution Webhook] Falha ao sincronizar dados com banco:', dbErr);
      }
    }

    // 4. Gerar link universal para adicionar no Google Calendar
    const gcalUrl = generateGoogleCalendarUrl({
      title: input.title || `Reunião Concept Digital: ${resolvedClientName}`,
      startDate: validDate,
      durationMinutes: 30,
      details: `Reunião com ${resolvedClientName}\nWhatsApp: ${clientPhoneDisplay}\n${input.client_company ? `Empresa: ${input.client_company}\n` : ''}${input.client_email ? `E-mail: ${input.client_email}\n` : ''}Notas: ${input.notes || 'Sessão de alinhamento e demonstração de ativos digitais Concept Digital.'}\n\nLink Google Meet: ${meetingUrl}`,
      location: meetingUrl,
    });

    // 5. Notificar no WhatsApp do sócio e número pessoal ("13978071057" e "13982292700")
    const partnerNumbers = getAdminNotificationNumbers();
    const adminNotificationMessage =
      `🚀 *NOVA REUNIÃO AGENDADA PELA IA!* 🎯\n\n` +
      `👤 *Cliente:* ${resolvedClientName}\n` +
      `📱 *WhatsApp:* ${clientPhoneDisplay}\n` +
      (input.client_company ? `🏢 *Empresa:* ${input.client_company}\n` : '') +
      (input.client_email ? `✉️ *E-mail:* ${input.client_email}\n` : '') +
      `📅 *Data & Hora:* ${formattedDate}\n` +
      `${countdown.label}\n` +
      `🔗 *Link do Google Meet:* ${meetingUrl}\n` +
      (input.notes ? `📝 *Contexto/Diagnóstico:* ${input.notes}\n` : '') +
      `\n📆 *Adicionar ao Google Calendar:*\n${gcalUrl}\n\n` +
      `_Sincronizado automaticamente no CRM Concept Digital_`;

    console.info(`[Evolution Webhook] Disparando aviso de agendamento para os sócios (${partnerNumbers.join(', ')})...`);
    Promise.allSettled(
      partnerNumbers.map(async (num) => {
        try {
          await sendEvolutionMessage(num, adminNotificationMessage);
          console.info(`[Evolution Webhook] Notificação entregue com sucesso para sócio ${num}`);
        } catch (notifErr) {
          console.error(`[Evolution Webhook] Erro ao enviar aviso para sócio ${num}:`, notifErr);
        }
      })
    ).catch((pErr) => console.error('[Evolution Webhook] Erro em disparos aos sócios:', pErr));

    // 6. Mensagem de resposta para o cliente no WhatsApp com confirmação, Meet e link do Google Calendar
    return (
      `Perfeito, ${resolvedClientName}! Agendado para ${formattedDate}.\n\n` +
      `Aqui está o link da nossa chamada no Google Meet: ${meetingUrl}\n\n` +
      `Se quiser adicionar direto na sua agenda: ${gcalUrl}\n\n` +
      `Te vejo lá!`
    );
  };

  const primaryModel = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

  try {
    const response = await anthropic.messages.create({
      model: primaryModel,
      max_tokens: 220,
      temperature: 0.5,
      system: systemPrompt,
      tools,
      messages: chatMessages,
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
    if (toolUse && toolUse.name === 'schedule_appointment') {
      return await processToolCall(toolUse);
    }

    const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
    return textBlock?.text || '';
  } catch (err) {
    console.error(`[Evolution Webhook] Erro ao chamar Claude (${primaryModel}):`, err);
    // Fallback para claude-3-5-haiku-20241022 caso a conta/modelo precise de fallback
    try {
      const fallbackResponse = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 220,
        temperature: 0.5,
        system: systemPrompt,
        tools,
        messages: chatMessages,
      });

      const fallbackToolUse = fallbackResponse.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
      if (fallbackToolUse && fallbackToolUse.name === 'schedule_appointment') {
        return await processToolCall(fallbackToolUse);
      }

      const textBlock = fallbackResponse.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
      return textBlock?.text || '';
    } catch (fallbackErr) {
      console.error('[Evolution Webhook] Erro no fallback do Claude:', fallbackErr);
      return '';
    }
  }
}

