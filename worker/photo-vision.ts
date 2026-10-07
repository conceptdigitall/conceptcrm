import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

export type PhotoVerdict = 'ok' | 'escura' | 'borrada';

export interface VisionDeps {
  classify(images: Buffer[]): Promise<PhotoVerdict[]>;
}

const MODEL = process.env.VIDEO_MODEL || 'claude-haiku-4-5-20251001';
const MAX_SIDE = 1024;
const VERDICTS: PhotoVerdict[] = ['ok', 'escura', 'borrada'];

export async function photoDimensions(files: Buffer[]): Promise<Array<{ width: number; height: number }>> {
  return Promise.all(
    files.map(async (f) => {
      const { width, height } = await sharp(f).metadata();
      return { width: width ?? 0, height: height ?? 0 };
    }),
  );
}

// Lê o array JSON devolvido pelo Claude (em bloco ```json ou solto) e exige
// um veredito válido por foto: resposta torta nunca aprova em silêncio.
export function parseVisionReply(text: string, count: number): PhotoVerdict[] {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('A checagem das fotos não devolveu uma lista');
  const parsed: unknown = JSON.parse(body.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.length !== count || !parsed.every((v) => VERDICTS.includes(v as PhotoVerdict))) {
    throw new Error('A checagem das fotos devolveu uma resposta inválida');
  }
  return parsed as PhotoVerdict[];
}

export const defaultVisionDeps: VisionDeps = {
  async classify(images) {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          ...images.map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: img.toString('base64') },
          })),
          {
            type: 'text' as const,
            text: [
              `Avalie cada uma das ${images.length} fotos acima, na ordem em que aparecem.`,
              'Para cada foto responda: "ok"; "escura" se estiver tão escura ou subexposta que não dá para ver bem o corte, o produto ou o ambiente; "borrada" se estiver fora de foco ou tremida.',
              `Responda só com um array JSON com exatamente ${images.length} itens, por exemplo ["ok","escura"].`,
            ].join('\n'),
          },
        ],
      }],
    });
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return parseVisionReply(text, images.length);
  },
};

// Mensagens em português simples para o dono; lista vazia = tudo certo.
export async function checkPhotoQuality(deps: VisionDeps, files: Buffer[]): Promise<string[]> {
  const small = await Promise.all(
    files.map((f) =>
      sharp(f).resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
    ),
  );
  const verdicts = await deps.classify(small);
  if (verdicts.length !== files.length) throw new Error('A checagem das fotos devolveu uma resposta inválida');
  const messages: string[] = [];
  verdicts.forEach((v, i) => {
    if (v !== 'ok') messages.push(`A foto ${i + 1} está ${v}, quer trocar?`);
  });
  return messages;
}
