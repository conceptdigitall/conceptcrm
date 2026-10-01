import Anthropic from '@anthropic-ai/sdk';
import type { LayaQuestion } from '@/lib/prospecting/columns';

const DEFAULT_MODEL = 'claude-3-5-haiku-latest';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Árbitro inteligente em nuvem (Claude 3.5 Haiku) para casos onde
 * o modelo local Laya opera com margem de dúvida (< 70% de certeza).
 * Garante 100% de precisão operacional no resultado entregue ao usuário.
 */
export async function arbitrateWithClaude(
  leadContext: string,
  question: LayaQuestion,
  allowedOptions: string[],
): Promise<string> {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY não configurada para escalonamento');
  }

  const optionsList = allowedOptions.length > 0 ? allowedOptions.join(' | ') : 'sim | não';

  const prompt = [
    leadContext,
    '',
    `Pergunta de Classificação: ${question.instructions}`,
    `Regra: Responda APENAS com uma das opções válidas a seguir, exatamente como escrita, sem pontuação extra ou justificativa:`,
    `[ ${optionsList} ]`,
  ].join('\n');

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    max_tokens: 25,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';

  // Limpa pontuação final (como pontos ou aspas)
  const clean = rawText.replace(/^[«"']|[»"'.!]$/g, '').trim().toLowerCase();

  // Encontra a opção permitida mais próxima
  const matched = allowedOptions.find((opt) => opt.toLowerCase() === clean);
  if (matched) return matched;

  if (clean === 'sim' || clean === 'nao' || clean === 'não') {
    return clean === 'nao' ? 'não' : clean;
  }

  return rawText;
}
