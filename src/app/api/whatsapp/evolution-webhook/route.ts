import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

// Inicializa o cliente Anthropic (Claude)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-0d4c.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'concept_master_evolution_2026';
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'concept-atendimento';

// Helper para pausar execução (Delay humano randômico)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper para simular comportamento humano na Evolution API
async function simulateHumanPresence(remoteJid: string, delayMs: number) {
  try {
    // 1. Marca a mensagem como lida
    await fetch(`${EVOLUTION_URL}/chat/markMessageAsRead/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        readMessages: [{ remoteJid, fromMe: false, id: '' }],
      }),
    });

    // 2. Envia status de "digitando..." (composing)
    await fetch(`${EVOLUTION_URL}/chat/sendPresence/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: remoteJid.replace('@s.whatsapp.net', ''),
        presence: 'composing', // 'composing' = digitando...
        delay: delayMs,
      }),
    });
  } catch (err) {
    console.error('[Evolution] Erro ao simular presença:', err);
  }
}

// Enviar mensagem de texto via Evolution API
async function sendEvolutionMessage(number: string, text: string) {
  const cleanNumber = number.replace('@s.whatsapp.net', '');
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: cleanNumber,
      text: text,
      delay: 1200, // delay de digitação interno da Evolution
    }),
  });
  return res.json();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Filtrar apenas mensagens recebidas válidas
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_event' });
    }

    const data = body.data;
    const key = data?.key;

    // Ignora mensagens enviadas pelo próprio bot/celular
    if (key?.fromMe) {
      return NextResponse.json({ status: 'from_me_ignored' });
    }

    // Ignora mensagens de grupos
    const remoteJid = key?.remoteJid || '';
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
      return NextResponse.json({ status: 'group_ignored' });
    }

    // Extrair o texto da mensagem
    const messageText =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      '';

    if (!messageText.trim()) {
      return NextResponse.json({ status: 'no_text_content' });
    }

    const senderName = data.pushName || 'Cliente';
    const senderNumber = remoteJid.replace('@s.whatsapp.net', '');

    console.log(`[Nova Mensagem] ${senderName} (${senderNumber}): "${messageText}"`);

    // ==========================================
    // REGRAS DE SEGURANÇA & HUMANIZAÇÃO (ANTI-BAN)
    // ==========================================
    // Gera um delay randômico entre 8 e 15 segundos
    const randomDelay = Math.floor(Math.random() * (15000 - 8000 + 1)) + 8000;
    
    // Dispara a simulação de "lido" e "digitando..."
    await simulateHumanPresence(remoteJid, randomDelay);

    // Espera o tempo humano passar enquanto o Claude processa a resposta
    const [claudeResponse] = await Promise.all([
      generateClaudeReply(senderName, messageText),
      sleep(randomDelay)
    ]);

    // Envia a resposta calculada
    if (claudeResponse) {
      await sendEvolutionMessage(remoteJid, claudeResponse);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Evolution Webhook Handler Error]:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

// Função que consulta o Claude com o Brandbook da Concept Digital
async function generateClaudeReply(userName: string, userMessage: string): Promise<string> {
  const systemPrompt = `
Você é a inteligência executiva de atendimento da Concept Digital (empresa de engenharia de vendas e soluções em software).
Seu papel é recepcionar empresários, médicos, advogados e executivos de alto padrão que chegam via WhatsApp.

DIRETRIZES DA MARCA:
- Propósito: Elevar o posicionamento digital de negócios premium através de engenharia de vendas e design.
- O que fazemos: Softwares sob medida, Web Apps, CRM, Landing Pages de alta conversão, E-commerces e ativos digitais de alta performance.
- Tom de Voz: Direto, suave, maduro e sofisticado. Você NUNCA usa gírias de internet, empolgação forçada, nem termos como "sites tops", "precinho", "bombar".
- Vocabulário obrigatório: "Ativos digitais de alto padrão", "engenharia de vendas", "conversão", "solução de gargalos".

REGRAS DE CONDUTA NO CHAT:
1. Respostas concisas e fluidas para WhatsApp (máximo de 2 a 4 frases por resposta). Nada de blocos gigantes de texto.
2. Identifique a dor/necessidade do cliente e esclareça dúvidas objetivas sobre as soluções da Concept Digital.
3. Não passe valores fechados, pois cada projeto é estruturado sob medida após diagnóstico.
4. Quando o cliente demonstrar interesse ou quiser avançar, proponha uma sessão rápida de diagnóstico ou colete a preferência de dia/horário para a agenda com o especialista técnico.
5. Nome do cliente: "${userName}". Use o primeiro nome de forma natural e sutil.
`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022', // ou claude-3-5-haiku-20241022 para respostas ainda mais ágeis
    max_tokens: 300,
    temperature: 0.5,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage }
    ],
  });

  const firstBlock = response.content[0];
  if (firstBlock.type === 'text') {
    return firstBlock.text;
  }
  return '';
}
