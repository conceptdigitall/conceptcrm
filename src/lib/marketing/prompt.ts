import type { VideoFormat, VideoTone } from '@/types';

export const FORMAT_SIZE: Record<VideoFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

export function buildUserPrompt(input: {
  prompt: string; format: VideoFormat; tone: VideoTone; imageFiles: string[];
}): string {
  const { width, height } = FORMAT_SIZE[input.format];
  const images = input.imageFiles.length
    ? input.imageFiles.map((f) => `- ${f}`).join('\n')
    : 'Nenhuma foto enviada: use tipografia, formas e cor.';
  return [
    'Crie um vídeo promocional curto para um negócio local brasileiro.',
    '',
    `Briefing do cliente: ${input.prompt}`,
    `Tela: ${width}x${height}. Duração total: entre 15 e 25 segundos.`,
    `Tom: ${input.tone} (veja as definições de tom).`,
    'Fotos disponíveis (caminhos relativos ao projeto; use todas pelo menos uma vez):',
    images,
    '',
    'Todo texto na tela em português do Brasil. Preços, endereços e nomes exatamente como no briefing.',
    'Sem áudio. Sem fontes ou imagens externas além das fotos listadas.',
    'Responda com UM bloco ```html contendo o index.html completo da composição HyperFrames, e nada mais.',
  ].join('\n');
}

export function buildFixPrompt(checkOutput: string): string {
  return [
    'O `npx hyperframes check` falhou com a saída abaixo. Corrija a composição.',
    'Responda de novo com UM bloco ```html contendo o index.html completo.',
    '',
    '```',
    checkOutput.slice(-6000),
    '```',
  ].join('\n');
}

export function extractHtml(text: string): string | null {
  const fenced = text.match(/```html\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const trimmed = text.trim();
  if (/^<!doctype html|^<html/i.test(trimmed)) return trimmed;
  return null;
}
