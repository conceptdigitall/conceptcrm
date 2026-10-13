import type { VideoFormat, VideoTone } from '@/types';
import type { VideoDuration, VideoStyle, VideoTarget } from './video-options';

export const FORMAT_SIZE: Record<VideoFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

export function buildUserPrompt(input: {
  prompt: string; format: VideoFormat; tone: VideoTone; imageFiles: string[]; audio?: string[];
  style?: VideoStyle; duration?: VideoDuration; target?: VideoTarget; still?: boolean;
}): string {
  const { width, height } = FORMAT_SIZE[input.format];
  const images = input.imageFiles.length
    ? input.imageFiles.map((f) => `- ${f}`).join('\n')
    : 'Nenhuma foto enviada: use tipografia, formas e cor.';
  const brief = input.prompt
    ? `Briefing do cliente: ${input.prompt}`
    : [
        'Sem briefing em texto: o vídeo é montado só com as fotos.',
        'Mostre as fotos como protagonistas, com textos curtos e genéricos (ex.: "Venha conhecer").',
        'Não invente preços, nomes, endereços ou promoções que não aparecem nas fotos.',
      ].join('\n');
  const lowerPrompt = (input.prompt || '').toLowerCase();
  // Estilo escolhido no painel manda; em 'auto' (ou pedido antigo) vale a detecção por palavra.
  const style = input.style ?? 'auto';
  const auto = style === 'auto';
  const isWhiteboard = style === 'whiteboard' || (auto && (lowerPrompt.includes('whiteboard') || lowerPrompt.includes('lousa') || lowerPrompt.includes('mão') || lowerPrompt.includes('desenho')));
  const isCutout = style === 'cutout' || (auto && (lowerPrompt.includes('cutout') || lowerPrompt.includes('colagem') || lowerPrompt.includes('roast')));
  const isContador = style === 'contador' || (auto && (lowerPrompt.includes('contador') || lowerPrompt.includes('faturamento') || lowerPrompt.includes('pix') || lowerPrompt.includes('r$')));

  const styleDirectives: string[] = [
    'Estilo de animação obrigatório:',
    '- A biblioteca de animações JavaScript `assets/animacoes.js` e os ativos vetoriais `assets/icons/` e `assets/hand.svg` estão disponíveis no projeto. Importe `<script src="assets/animacoes.js"></script>` no `<head>`.',
    '- Kinetic Typography: textos grandes e impactantes como protagonistas (1 frase por cena, 3 a 6 palavras). O vídeo precisa ser compreensível mesmo sem som (a narração reforça, não substitui o texto).',
    '- Movimento imediato no 1º segundo (0.0s): texto batendo na tela com `ConceptAnim.kineticPunch` ou entrada dinâmica. Zero logos ou intros vazias.',
    '- Mudança visual a cada 2–3 segundos (corte, zoom, novo elemento ou frase) para retenção máxima.',
    '- Contraste acessível rigoroso (mínimo 4.5:1, ex: texto branco sobre fundos escuros, preto sobre amarelo) para passar na checagem de acessibilidade.',
    '- Finalize com CTA animado e direto (ex: "Comenta IA", "Salva isso", "Manda direct").',
  ];

  if (isWhiteboard) {
    styleDirectives.push(
      '',
      'DIRETRIZES WHITEBOARD (Lousa / Desenho com Mão):',
      '- Use fundo claro limpo (#fafaf9 ou #fdfbf7) com traços em preto (#18181b) e destaques em dourado Concept (#ca8a04 / #eab308).',
      '- Inclua a mão com caneta no body: `<img id="hand" src="assets/hand.svg" style="position: absolute; width: 140px; pointer-events: none; opacity: 0; z-index: 999;" />`.',
      '- Utilize ícones vetoriais de `assets/icons/` (ex: `relogio.svg`, `celular-whatsapp.svg`, `robo-ia.svg`, `pix-moeda.svg`, `foguete.svg`, `grafico.svg`, `alerta-dor.svg`).',
      '- Acione o traçado com `ConceptAnim.whiteboard(tl, { svg: "#elemento", hand: "#hand", duration: 1.6, at: tempo })`.',
    );
  }

  if (isCutout) {
    styleDirectives.push(
      '',
      'DIRETRIZES CUTOUT / COLAGEM:',
      '- Use cards com estilo de print recortado, bordas sólidas, sombra dura (#09090b) e rotação leve.',
      '- Acione a entrada com `ConceptAnim.cutout(tl, { target: "#card", rotation: -3.5, duration: 0.35, at: tempo })`.',
    );
  }

  if (isContador) {
    styleDirectives.push(
      '',
      'DIRETRIZES DE DADOS / CONTADOR:',
      '- Use `ConceptAnim.contador(tl, { target: "#contador", start: 0, end: valor, prefix: "R$ ", suffix: "", duration: 2.0, at: tempo })` para números que escalam com impacto.',
    );
  }

  if (style === 'kinetic') {
    styleDirectives.push(
      '',
      'ESTILO ESCOLHIDO: TEXTO ANIMADO (Kinetic Typography puro):',
      '- O vídeo inteiro é tipografia animada: sem lousa, sem colagem. Fotos, se houver, entram só como fundo de cena.',
    );
  }

  if (style === 'fotos') {
    styleDirectives.push(
      '',
      'ESTILO ESCOLHIDO: FOTOS EM DESTAQUE:',
      '- As fotos enviadas são as protagonistas e ocupam a tela toda, com zoom lento (Ken Burns) e cortes no ritmo da fala.',
      '- Texto curto por cima, com faixa ou sombra para garantir o contraste.',
    );
  }

  if (input.still) {
    return [
      'Crie a ARTE ESTÁTICA de um post de foto do Instagram, em português do Brasil, para o negócio do briefing. Siga o Playbook da Concept Digital.',
      '',
      brief,
      `Tela: ${width}x${height}. Composição HyperFrames de 2 segundos, sem animação: tudo já visível e parado desde o frame 0, porque só o frame 0 vira a imagem do post.`,
      'Uma mensagem só: título grande (3 a 8 palavras), no máximo uma linha de apoio e um elemento visual forte. Contraste mínimo 4.5:1.',
      'Fotos disponíveis (caminhos relativos ao projeto):',
      images,
      'Sem áudio. Sem fontes ou imagens externas além das fotos e assets locais listados.',
      'Todo texto na tela em português do Brasil. Preços, endereços e nomes exatamente como no briefing.',
      'Responda com UM bloco ```html contendo o index.html completo da composição HyperFrames, e nada mais.',
    ].join('\n');
  }

  const seconds = input.duration;
  const durationLine = seconds
    ? `Duração total: cerca de ${seconds} segundos (entre ${seconds - 2} e ${seconds + 3}).`
    : 'Duração total: entre 15 e 25 segundos.';
  const storyLines = input.target === 'story'
    ? [
        'Formato: Story do Instagram (9:16). Deixe livres os 250px de cima e os 300px de baixo, onde fica a interface do app.',
        'Termine com um convite para responder o story ou tocar no link.',
      ]
    : [];

  return [
    'Crie um vídeo promocional curto em português do Brasil, para o negócio descrito no briefing (cliente local ou a própria Concept Digital). Siga o Playbook da Concept Digital.',
    '',
    brief,
    `Tela: ${width}x${height}. ${durationLine}`,
    ...storyLines,
    `Tom: ${input.tone} (veja as definições de tom).`,
    'Fotos disponíveis (caminhos relativos ao projeto; use todas pelo menos uma vez):',
    images,
    '',
    ...styleDirectives,
    '',
    'Todo texto na tela em português do Brasil. Preços, endereços e nomes exatamente como no briefing.',
    ...(input.audio ?? ['Sem áudio.']),
    'Sem fontes ou imagens externas além das fotos e assets locais listados.',
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
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const fencedGeneric = text.match(/```\s*(<!doctype[\s\S]*?)```/i);
  if (fencedGeneric) return fencedGeneric[1].trim();
  const docMatch = text.match(/(<!doctype html[\s\S]*?<\/html>)/i);
  if (docMatch) return docMatch[1].trim();
  const trimmed = text.trim();
  if (/^<!doctype html|^<html/i.test(trimmed)) return trimmed;
  return null;
}
