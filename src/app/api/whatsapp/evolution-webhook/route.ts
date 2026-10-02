import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import Anthropic from '@anthropic-ai/sdk';
import { cleanReplyFormatting } from '@/lib/whatsapp/clean-formatting';
import { executeCheckAvailability, executeScheduleAppointment } from '@/lib/calendar/ai-calendar-tools';

export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-0d4c.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'concept-atendimento';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulateHumanPresence(remoteJid: string, delayMs: number) {
  if (!EVOLUTION_URL || !EVOLUTION_KEY || !INSTANCE) return;
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
  if (!EVOLUTION_URL || !EVOLUTION_KEY || !INSTANCE) {
    throw new Error('Evolution API não configurada (EVOLUTION_API_KEY ou EVOLUTION_INSTANCE_NAME ausente)');
  }
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
  const { data: config } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('account_id, user_id')
    .limit(1)
    .maybeSingle();

  if (config?.account_id && config?.user_id) {
    return { accountId: config.account_id, userId: config.user_id };
  }

  const { data: acc } = await supabaseAdmin()
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
    const { data: initialContact, error: contactErr } = await supabaseAdmin()
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone', senderNumber)
      .maybeSingle();
    contact = initialContact;

    if (contactErr) {
      console.warn('[Evolution Webhook] Aviso ao consultar contato:', contactErr.message);
      const { data: fallbackContact } = await supabaseAdmin()
        .from('contacts')
        .select('id')
        .eq('phone', senderNumber)
        .maybeSingle();
      contact = fallbackContact;
    }

    if (!contact) {
      const { data: createdContact, error: insertContactErr } = await supabaseAdmin()
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
        const { data: retryContact } = await supabaseAdmin()
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
      const { data: conv, error: convFetchErr } = await supabaseAdmin()
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
        const { data: newConv, error: convErr } = await supabaseAdmin()
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
          const { data: retryConv } = await supabaseAdmin()
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
        await supabaseAdmin()
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

        const { data: insertedRows, error: msgErr } = await supabaseAdmin()
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
      const sanitizedReply = cleanReplyFormatting(replyText);
      if (sanitizedReply) {
        // Envia via WhatsApp
        await sendEvolutionMessage(remoteJid, sanitizedReply);

        // Salva a resposta da IA no CRM também
        if (conversationId) {
          const { error: botMsgErr } = await supabaseAdmin().from('messages').insert({
            conversation_id: conversationId,
            content_text: sanitizedReply,
            content_type: 'text',
            sender_type: 'bot',
            status: 'sent',
          });

          if (botMsgErr) {
            console.error('[Evolution Webhook] Erro ao salvar mensagem do bot:', botMsgErr);
          }

          await supabaseAdmin()
            .from('conversations')
            .update({
              last_message_text: sanitizedReply,
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId);
        }
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
3. Horário de atendimento: Segunda a sábado, das 09h às 18h (almoço das 12h às 13h reservado).
4. Apresentação de Preços: Mencione faixas estimadas de investimento (ex: pacotes a partir de R$ 1.000 a R$ 1.500) com naturalidade e sofisticação, sempre condicionando ao diagnóstico das necessidades específicas do projeto.
5. Consulta de Agenda em Tempo Real (REGRA CRÍTICA):
   - Quando o lead perguntar sobre dias/horários disponíveis ou demonstrar interesse em marcar (ex: "Vocês têm horário na quinta-feira?", "Qual o próximo horário livre?"), acione IMEDIATAMENTE a ferramenta "check_availability".
   - A ferramenta consulta a agenda do Google Calendar e o CRM e retorna os horários livres.
   - Apresente ao lead 2 ou 3 horários específicos para facilitar a escolha rápida (ex: "Temos horários livres às 10h, às 14h30 e às 16h. Qual desses fica melhor para você?").
6. Sincronização & Agendamento via Tool:
   - Assim que o lead escolher ou confirmar um horário, acione IMEDIATAMENTE a ferramenta "schedule_appointment".
   - Extraia e passe para os parâmetros da ferramenta tudo o que o cliente tiver mencionado: nome real (client_name), empresa/nicho (client_company), e-mail (client_email), e um breve resumo das necessidades/gargalos (notes).
7. Nome do cliente atual: "${userName}". Use o primeiro nome de forma natural e sutil.
8. PROIBIDO FORMATAR EM NEGRITO OU USAR ASTERISCOS (REGRA CRÍTICA): NUNCA use negrito, asteriscos duplos (**) ou simples (*) nas mensagens enviadas ao lead. Escreva sempre em texto puro, fluido e natural, exatamente como uma pessoa real conversando no WhatsApp, sem nenhuma formatação markdown.
`;

  const tools: Anthropic.Tool[] = [
    {
      name: 'check_availability',
      description: 'Consulta a agenda em tempo real no Google Calendar e CRM para verificar horários disponíveis em uma data específica (segunda a sábado, das 09h às 18h, exceto almoço 12h-13h). Retorna os slots livres para sugerir ao cliente.',
      input_schema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Data a ser consultada no formato YYYY-MM-DD (ex: 2026-10-12)',
          },
          time_preference: {
            type: 'string',
            description: 'Preferência de turno se o cliente mencionou: "manha", "tarde" ou "qualquer"',
          },
          duration_minutes: {
            type: 'number',
            description: 'Duração da reunião em minutos (padrão 30)',
          },
        },
        required: ['date'],
      },
    },
    {
      name: 'schedule_appointment',
      description: 'Acione esta ferramenta para registrar a reunião/demonstração no CRM, sincronizar dados com o Google Calendar (criando sala Google Meet) e notificar a diretoria via WhatsApp quando o lead confirmar dia e horário.',
      input_schema: {
        type: 'object',
        properties: {
          datetime_iso: {
            type: 'string',
            description: 'Data e hora da reunião no formato ISO 8601 (ex: 2026-10-12T14:30:00-03:00)',
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
      const { data: history } = await supabaseAdmin()
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
          const cleanContent = cleanReplyFormatting(m.content_text);
          if (!cleanContent) continue;
          if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== role) {
            chatMessages.push({ role, content: cleanContent });
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

  // Helper para processar tool calls de agendamento e consulta de agenda
  const processToolCall = async (toolUse: Anthropic.ToolUseBlock): Promise<string> => {
    if (toolUse.name === 'check_availability') {
      const input = toolUse.input as {
        date?: string;
        time_preference?: string;
        duration_minutes?: number;
      };
      const checkRes = await executeCheckAvailability({
        date: input.date || new Date().toISOString().split('T')[0],
        timePreference: input.time_preference,
        durationMinutes: input.duration_minutes || 30,
        accountId,
      });
      return cleanReplyFormatting(checkRes.replyText);
    }

    if (toolUse.name === 'schedule_appointment') {
      const input = toolUse.input as {
        datetime_iso?: string;
        title?: string;
        client_name?: string;
        client_company?: string;
        client_email?: string;
        notes?: string;
      };
      const scheduleRes = await executeScheduleAppointment({
        datetimeIso: input.datetime_iso || new Date().toISOString(),
        title: input.title,
        clientName: input.client_name?.trim() || (userName !== 'Novo Lead' ? userName : '') || 'Cliente',
        clientCompany: input.client_company,
        clientEmail: input.client_email,
        notes: input.notes,
        senderPhone,
        contactId,
        accountId,
        userId,
        conversationId,
        sendEvolutionMessage,
      });
      return cleanReplyFormatting(scheduleRes.replyMessage);
    }

    return '';
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
    if (toolUse && (toolUse.name === 'schedule_appointment' || toolUse.name === 'check_availability')) {
      return await processToolCall(toolUse);
    }

    const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
    return cleanReplyFormatting(textBlock?.text || '');
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
      if (fallbackToolUse && (fallbackToolUse.name === 'schedule_appointment' || fallbackToolUse.name === 'check_availability')) {
        return await processToolCall(fallbackToolUse);
      }

      const textBlock = fallbackResponse.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
      return cleanReplyFormatting(textBlock?.text || '');
    } catch (fallbackErr) {
      console.error('[Evolution Webhook] Erro no fallback do Claude:', fallbackErr);
      return '';
    }
  }
}

