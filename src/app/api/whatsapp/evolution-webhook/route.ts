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
        number: remoteJid.replace('@s.whatsapp.net', ''),
        presence: 'composing',
        delay: delayMs,
      }),
    });
  } catch (err) {
    console.error('[Evolution Presence Error]:', err);
  }
}

async function sendEvolutionMessage(number: string, text: string) {
  const cleanNumber = number.replace('@s.whatsapp.net', '');
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

    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_event' });
    }

    const data = body.data;
    const key = data?.key;

    // Ignora mensagens enviadas pelo próprio número ou grupos
    if (key?.fromMe) return NextResponse.json({ status: 'from_me_ignored' });
    const remoteJid = key?.remoteJid || '';
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
      return NextResponse.json({ status: 'group_ignored' });
    }

    const messageText =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      '';

    if (!messageText.trim()) return NextResponse.json({ status: 'no_text' });

    const senderName = data.pushName || 'Lead WhatsApp';
    const senderNumber = remoteJid.replace('@s.whatsapp.net', '');

    console.log(`[Nova Mensagem] ${senderName} (${senderNumber}): ${messageText}`);

    // ========================================================
    // 1. GRAVAR NO BANCO DO CRM (SUPABASE) PARA MOSTRAR NA INBOX
    // ========================================================
    const { accountId, userId } = await getAccountAndUser();

    // Busca ou cria o contato
    let { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone', senderNumber)
      .maybeSingle();

    if (!contact) {
      const { data: newContact, error: errContact } = await supabase
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: userId,
          name: senderName,
          phone: senderNumber,
        })
        .select('id')
        .maybeSingle();

      if (errContact) {
        console.error('[Evolution Webhook] Erro ao criar contato:', errContact);
        const { data: retryContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('account_id', accountId)
          .eq('phone', senderNumber)
          .maybeSingle();
        contact = retryContact;
      } else {
        contact = newContact;
      }
    }

    // Busca ou cria a conversa vinculada ao contato
    let conversationId: string | null = null;
    if (contact?.id) {
      let { data: conv } = await supabase
        .from('conversations')
        .select('id, unread_count')
        .eq('account_id', accountId)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const nowIso = new Date().toISOString();

      if (!conv) {
        const { data: newConv, error: errConv } = await supabase
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

        if (errConv) {
          console.error('[Evolution Webhook] Erro ao criar conversa:', errConv);
          const { data: retryConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('account_id', accountId)
            .eq('contact_id', contact.id)
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

      // Grava a mensagem recebida na tabela messages
      if (conversationId) {
        const { error: msgErr } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          content_text: messageText,
          content_type: 'text',
          sender_type: 'customer',
          status: 'delivered',
          message_id: key?.id || undefined,
        });

        if (msgErr) {
          console.error('[Evolution Webhook] Erro ao salvar mensagem do cliente:', msgErr);
        }
      }
    }

    // ========================================================
    // 2. REGRAS HUMANAS & RESPOSTA INTELIGENTE (CLAUDE)
    // ========================================================
    const randomDelay = Math.floor(Math.random() * (12000 - 7000 + 1)) + 7000;
    await simulateHumanPresence(remoteJid, randomDelay);

    const [replyText] = await Promise.all([
      generateClaudeReply(senderName, messageText),
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

async function generateClaudeReply(userName: string, userMessage: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Evolution Webhook] ANTHROPIC_API_KEY não configurada no .env.local');
    return '';
  }

  const systemPrompt = `
Você é a inteligência executiva da Concept Digital (engenharia de vendas e soluções em software).
Você atende empresários, médicos, advogados e gestores de alto padrão via WhatsApp.

DIRETRIZES DA MARCA:
- Propósito: Elevar o posicionamento digital de negócios premium através de engenharia de vendas e design funcional.
- Serviços: Softwares sob medida, Web Apps, CRM, Landing Pages de alta conversão e infraestruturas digitais de alta performance.
- Tom de Voz: Direto, suave, maduro e sofisticado. Jamais use gírias ou jargões agressivos ("precinho", "bombar", "top").
- Formato: Respostas objetivas e elegantes (máximo de 2 a 4 frases). 
- Agendamento: Se o cliente quiser avançar, proponha uma sessão de diagnóstico técnico com o arquiteto de soluções e pergunte a preferência de dia/horário.
- Nome do cliente: "${userName}".
`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 300,
    temperature: 0.5,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}
