import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-0d4c.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'concept_master_evolution_2026';
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'concept-atendimento';

/**
 * Resolve o account_id e user_id ativos no CRM
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

    // Aceita tanto os nomes enviados pela interface do CRM quanto os parâmetros simplificados
    const conversationIdInput = body.conversation_id || body.conversationId;
    const contactIdInput = body.contact_id || body.contactId;
    const textInput = body.content_text || body.text || body.content || '';
    const phoneInput = body.phone || body.number || '';
    const messageType = body.message_type || body.messageType || 'text';
    const mediaUrl = body.media_url || body.mediaUrl || '';

    const { accountId, userId } = await getAccountAndUser();

    let resolvedPhone = phoneInput;
    let conversationId: string | null = conversationIdInput || null;
    let contactId: string | null = contactIdInput || null;

    // 1. Se recebemos conversation_id (caso comum do chat da Inbox)
    if (conversationId) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id, contact_id, account_id, contacts(id, phone, name)')
        .eq('id', conversationId)
        .maybeSingle();

      if (convErr) {
        console.error('[Send Message] Erro ao buscar conversa:', convErr);
      }

      if (conv) {
        contactId = conv.contact_id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contactData = conv.contacts as any;
        if (contactData?.phone && !resolvedPhone) {
          resolvedPhone = contactData.phone;
        }
      }
    }

    // 2. Se temos contact_id mas não temos telefone
    if (contactId && !resolvedPhone) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, phone')
        .eq('id', contactId)
        .maybeSingle();

      if (contact?.phone) {
        resolvedPhone = contact.phone;
      }
    }

    // 3. Se temos contact_id mas não temos conversation_id, busca ou cria a conversa
    if (contactId && !conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (conv) {
        conversationId = conv.id;
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            account_id: accountId,
            user_id: userId,
            contact_id: contactId,
            status: 'open',
          })
          .select('id')
          .single();
        conversationId = newConv?.id || null;
      }
    }

    // 4. Se temos apenas o telefone (sem contact_id nem conversation_id)
    if (resolvedPhone && !contactId) {
      const cleanNum = resolvedPhone.replace(/\D/g, '');
      let { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', cleanNum)
        .maybeSingle();

      if (!contact) {
        const { data: newContact } = await supabase
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: userId,
            name: 'Lead WhatsApp',
            phone: cleanNum,
          })
          .select('id')
          .single();
        contact = newContact;
      }

      if (contact?.id) {
        contactId = contact.id;
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            account_id: accountId,
            user_id: userId,
            contact_id: contact.id,
            status: 'open',
          })
          .select('id')
          .single();
        conversationId = newConv?.id || null;
      }
    }

    if (!resolvedPhone || !textInput.trim()) {
      return NextResponse.json(
        { error: 'Telefone e texto são obrigatórios' },
        { status: 400 }
      );
    }

    // Limpa o número para envio (apenas números)
    const cleanNumber = resolvedPhone.replace(/\D/g, '');

    // 5. Dispara a mensagem via Evolution API (WhatsApp conectado)
    const evoRes = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: textInput,
      }),
    });

    const evoData = await evoRes.json();

    if (!evoRes.ok) {
      console.error('[Evolution Send Error]:', evoData);
      return NextResponse.json(
        { error: evoData?.message || evoData?.error || 'Erro ao enviar via WhatsApp' },
        { status: 502 }
      );
    }

    const whatsappMessageId = evoData?.key?.id;

    // 6. Grava a mensagem enviada no Supabase para atualizar a Inbox
    let insertedMsgId: string | undefined;
    if (conversationId) {
      const { data: insertedMsg, error: insertErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content_text: textInput,
          content_type: messageType || 'text',
          media_url: mediaUrl || null,
          sender_type: 'agent',
          status: 'sent',
          message_id: whatsappMessageId,
        })
        .select('id')
        .maybeSingle();

      if (insertErr) {
        console.error('[Send Message] Erro ao salvar mensagem no Supabase:', insertErr);
      } else {
        insertedMsgId = insertedMsg?.id;
      }

      // Atualiza o preview e horário da conversa
      const nowIso = new Date().toISOString();
      await supabase
        .from('conversations')
        .update({
          last_message_text: textInput,
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', conversationId);
    }

    return NextResponse.json({
      success: true,
      message_id: insertedMsgId || whatsappMessageId,
      whatsapp_message_id: whatsappMessageId,
      data: evoData,
    });
  } catch (error) {
    console.error('[Send Message Route Error]:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
