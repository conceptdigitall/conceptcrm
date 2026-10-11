// Narração dos vídeos de marketing: o texto vem do Claude, a voz (Matilda) da ElevenLabs.
// Falhar aqui nunca derruba o job: o vídeo sai só com a trilha, como antes.
export interface Narration {
  audio: Buffer;
  text: string;
  duration: number;
  words: { word: string; start: number; end: number }[];
}

export const NARRATION_START = 0.4;
// Matilda: voz pré-pronta, liberada no plano gratuito.
const DEFAULT_VOICE_ID = 'XrExE9yKIg1WjnnlVkGX';
export const MAX_NARRATION_WORDS = 48;

export function buildScriptPrompt(brief: string): string {
  return [
    'Escreva o texto de narração (locução) de um vídeo promocional vertical de ~20 segundos, em português do Brasil.',
    `Briefing: ${brief || 'vídeo institucional da Concept Digital (recepcionista de IA no WhatsApp para pequenos negócios)'}`,
    '',
    `Regras: no máximo ${MAX_NARRATION_WORDS} palavras; frases curtas e naturais para fala; abra com um gancho; feche com um CTA direto.`,
    'Só fatos do briefing: não invente preço, endereço, nome ou promoção. Sem emoji, sem aspas, sem rubricas, sem marcações de cena.',
    'Responda apenas com o texto a ser falado.',
  ].join('\n');
}

export function cleanScript(raw: string): string | null {
  const text = raw.replace(/```[a-z]*\n?|```/gi, '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const words = text.split(' ');
  return words.length > MAX_NARRATION_WORDS ? `${words.slice(0, MAX_NARRATION_WORDS).join(' ')}.` : text;
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export function alignmentToWords(a: Alignment): Narration['words'] {
  const out: Narration['words'] = [];
  let cur: { word: string; start: number; end: number } | null = null;
  a.characters.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) out.push(cur); cur = null; return; }
    if (!cur) cur = { word: '', start: a.character_start_times_seconds[i], end: 0 };
    cur.word += c;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) out.push(cur);
  return out;
}

export async function synthesize(text: string, fetchImpl: typeof fetch = fetch): Promise<Narration | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const res = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        language_code: 'pt',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.25 },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { audio_base64: string; alignment: Alignment };
  const words = alignmentToWords(j.alignment);
  const duration = j.alignment.character_end_times_seconds.at(-1) ?? 0;
  return { audio: Buffer.from(j.audio_base64, 'base64'), text, duration, words };
}

// Instruções de áudio que entram no prompt da composição.
export function audioPromptLines(n: Narration | null, hasMusic: boolean): string[] {
  if (!n) {
    return hasMusic
      ? ['Áudio: sem narração. Inclua só a trilha (veja abaixo).', ...musicLines(25)]
      : ['Sem áudio. Sem fontes ou imagens externas além das fotos listadas.'];
  }
  const end = +(NARRATION_START + n.duration).toFixed(2);
  const timing = n.words.map((w) => `${w.word}@${(w.start + NARRATION_START).toFixed(2)}`).join(' ');
  return [
    'ÁUDIO (obrigatório): o vídeo tem narração em off, já gerada em português do Brasil.',
    `<audio id="narration" src="assets/narration.mp3" data-start="${NARRATION_START}" data-duration="${n.duration.toFixed(2)}" data-track-index="10" data-volume="1"></audio>`,
    `Texto falado: ${n.text}`,
    `Tempo de cada palavra (segundos no vídeo): ${timing}`,
    `- A narração termina em ${end}s: a duração total do vídeo deve ser pelo menos ${(end + 1.2).toFixed(1)}s.`,
    '- Sincronize a frase de cada cena com o momento em que ela é falada; o texto na tela reforça a fala (não precisa repetir palavra por palavra).',
    ...(hasMusic ? musicLines(end + 1.2) : []),
    '- Mantenha o texto grande na tela: muita gente assiste sem som.',
  ];
}

function musicLines(total: number): string[] {
  return [
    `- Trilha de fundo (obrigatória, uma só): <audio id="music" src="assets/music.mp3" data-start="0" data-duration="DURACAO_TOTAL" data-track-index="11" data-volume="0.22"></audio>, onde DURACAO_TOTAL é a duração total do vídeo (≥ ${total.toFixed(1)}s, no máximo 60).`,
    '- Não troque os caminhos de áudio, não adicione outros arquivos de som, não toque áudio por script.',
  ];
}
