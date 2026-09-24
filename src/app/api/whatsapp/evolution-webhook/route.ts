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
  const cleanNumber = number.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
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
  contactId?: string | null;
  accountId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
}

async function generateClaudeReply({
  userName,
  userMessage,
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
5. Agendamento via Tool: Assim que o lead concordar com uma chamada ou sugerir um dia e horário comercial (segunda a sexta-feira, das 09h às 18h), acione IMEDIATAMENTE a ferramenta "schedule_appointment" com a data/hora em formato ISO 8601.
6. Nome do cliente: "${userName}". Use o primeiro nome de forma natural e sutil.
`;

  const tools: Anthropic.Tool[] = [
    {
      name: 'schedule_appointment',
      description: 'Acione esta ferramenta para registrar a reunião/demonstração no Google Meet quando o lead concordar com dia e horário (segunda a sexta-feira, das 09h às 18h).',
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
          notes: {
            type: 'string',
            description: 'Breve contexto ou necessidade manifestada pelo lead',
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

  // Helper para processar tool calls de agendamento
  const processToolCall = async (toolUse: Anthropic.ToolUseBlock): Promise<string> => {
    const input = toolUse.input as { datetime_iso?: string; title?: string; notes?: string };
    const rawIso = input.datetime_iso || new Date().toISOString();
    const scheduledDate = new Date(rawIso);
    const meetingUrl = 'https://meet.google.com/new';

    if (contactId) {
      try {
        const payload: Record<string, unknown> = {
          contact_id: contactId,
          title: input.title || 'Sessão de Diagnóstico & Demonstração',
          scheduled_at: !isNaN(scheduledDate.getTime()) ? scheduledDate.toISOString() : new Date().toISOString(),
          duration_minutes: 20,
          status: 'confirmed',
          meeting_url: meetingUrl,
          notes: input.notes || null,
        };
        if (accountId) payload.account_id = accountId;
        if (userId) payload.user_id = userId;

        const { error: insErr } = await supabase.from('appointments').insert(payload);
        if (insErr) {
          console.warn('[Evolution Webhook] Aviso ao salvar agendamento:', insErr.message);
        } else {
          console.info(`[Evolution Webhook] Agendamento salvo com sucesso para contato ${contactId}!`);
        }
      } catch (dbErr) {
        console.error('[Evolution Webhook] Falha ao registrar agendamento:', dbErr);
      }
    }

    const formattedDate = !isNaN(scheduledDate.getTime())
      ? new Intl.DateTimeFormat('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        }).format(scheduledDate)
      : rawIso;

    // Mensagem de confirmação concisa com data, hora e link da chamada
    return `Perfeito, ${userName}! Agendado para ${formattedDate}.\n\nAqui está o link da nossa chamada no Google Meet: ${meetingUrl}\n\nTe vejo lá!`;
  };

  const primaryModel = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

  try {
    const response = await anthropic.messages.create({
      model: primaryModel,
      max_tokens: 160,
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
        max_tokens: 160,
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

