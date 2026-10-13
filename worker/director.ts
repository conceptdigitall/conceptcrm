import Anthropic from '@anthropic-ai/sdk';
import {
  MAX_CAPTION_CHARS, MAX_HASHTAGS, validateDirectorOutput,
  type DirectorOutput, type Pack, type PackButton, type TemplateSpec,
} from '@/lib/marketing/packs/types';

export interface DirectorDeps {
  ask(system: string, user: string): Promise<string>;
}

export interface DirectorInput {
  pack: Pack;
  button: PackButton;
  spec: TemplateSpec;
  fields: Record<string, string>;
  photoCount: number;
  businessName: string;
}

export class DirectorError extends Error {
  constructor() {
    super('Não consegui montar o roteiro do vídeo. Tente de novo ou mude os textos.');
    this.name = 'DirectorError';
  }
}

const MODEL = process.env.VIDEO_MODEL || 'claude-haiku-4-5-20251001';
const MAX_ATTEMPTS = 2;
const HTML_TAG = /<\s*[a-z!/]/i;

function systemPrompt({ pack, button, spec }: DirectorInput): string {
  const limits = Object.entries(spec.texts)
    .map(([key, r]) => `- ${key}: até ${r.maxChars} caracteres${r.required ? ' (obrigatório)' : ' (opcional; use "" se não houver)'}`)
    .join('\n');
  return [
    `Você é o diretor de vídeos curtos de uma ${pack.name.toLowerCase()} brasileira.`,
    'Você NÃO escreve HTML nem CSS: só devolve os dados que preenchem um template de vídeo já pronto.',
    '',
    `Template: "${spec.name}" (id "${spec.id}").`,
    `Orientação do nicho: ${button.directorHint}`,
    '',
    'Textos do vídeo (português do Brasil, curtos, sem emojis nos textos da tela):',
    limits,
    '',
    'Regras:',
    '- Não invente preços, nomes, endereços, prazos ou promoções que não estejam nos dados do dono. Se não foi informado, não cite.',
    '- Use os valores do dono exatamente como foram escritos (preço, nome, prazo).',
    `- photoOrder é uma permutação dos índices das fotos (0 a N-1), cada índice uma vez.`,
    `- caption: legenda para Instagram/TikTok, com chamada para ação, até ${MAX_CAPTION_CHARS} caracteres.`,
    `- hashtags: de 5 a 10, começando com #, podendo reaproveitar: ${pack.hashtags.join(' ')}. No máximo ${MAX_HASHTAGS}.`,
    '- Nunca coloque marcação HTML em nenhum texto.',
    '',
    'Responda com UM bloco ```json contendo exatamente:',
    '{ "templateId": string, "photoOrder": number[], "texts": { ... }, "caption": string, "hashtags": string[] }',
  ].join('\n');
}

function userPrompt({ businessName, fields, photoCount }: DirectorInput): string {
  const filled = Object.entries(fields)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `- ${k}: ${v.trim()}`)
    .join('\n');
  return [
    `Negócio: ${businessName}`,
    'Dados informados pelo dono:',
    filled || '- (nenhum campo preenchido)',
    `Quantidade de fotos: ${photoCount}`,
  ].join('\n');
}

function parseJson(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
  const raw = fenced ?? reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

function check(input: DirectorInput, reply: string): { ok: true; value: DirectorOutput } | { ok: false; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = parseJson(reply);
  } catch {
    return { ok: false, errors: ['a resposta não é um JSON válido'] };
  }
  const result = validateDirectorOutput(input.spec, input.photoCount, parsed);
  if (!result.ok) return result;
  const errors: string[] = [];
  for (const [k, v] of Object.entries(result.value.texts)) {
    if (HTML_TAG.test(v)) errors.push(`o texto "${k}" não pode conter HTML`);
  }
  if (HTML_TAG.test(result.value.caption)) errors.push('a legenda não pode conter HTML');
  return errors.length ? { ok: false, errors } : result;
}

export async function runDirector(deps: DirectorDeps, input: DirectorInput): Promise<DirectorOutput> {
  const system = systemPrompt(input);
  let user = userPrompt(input);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const reply = await deps.ask(system, user);
    const result = check(input, reply);
    if (result.ok) return result.value;
    user = [
      userPrompt(input),
      '',
      'Sua resposta anterior foi recusada:',
      ...result.errors.map((e) => `- ${e}`),
      'Responda de novo com UM bloco ```json corrigido.',
    ].join('\n');
  }
  throw new DirectorError();
}

export const defaultDirectorDeps: DirectorDeps = {
  async ask(system, user) {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal') throw new Error('A IA recusou o pedido');
    return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  },
};
