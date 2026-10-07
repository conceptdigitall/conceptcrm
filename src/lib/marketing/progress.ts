export const STATUS_PHRASES = [
  'Carregando o seu vídeo…',
  'Analisando o briefing e as fotos…',
  'Montando a narrativa e a composição…',
  'Ajustando cenas, fontes e transições…',
  'Renderizando os quadros em alta definição…',
  'Isso pode demorar um pouco (2 a 3 min no Mac)…',
  'Quase lá! Finalizando o arquivo MP4…',
];

const SECONDS_PER_PHRASE = 4;

export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getStatusPhrase(seconds: number, phrases: string[] = STATUS_PHRASES): string {
  if (phrases.length === 0) return '';
  const safe = Math.max(0, Math.floor(seconds));
  const index = Math.floor(safe / SECONDS_PER_PHRASE) % phrases.length;
  return phrases[index];
}
