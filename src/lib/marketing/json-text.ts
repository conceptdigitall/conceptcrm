// Helpers puros para ler o JSON que a IA devolve (com texto antes/depois).

/** Primeiro objeto JSON dentro do texto; null se não houver ou estiver quebrado. */
export function parseObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]);
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Texto aparado e cortado em `max`; string vazia se não for texto. */
export const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Texto de terceiros para dentro de um prompt: sem `<`/`>` (não fecha o bloco de dados) e sem quebras de linha. */
export const textoDeDado = (v: string) => v.replace(/</g, '‹').replace(/>/g, '›').replace(/\s*[\r\n]+\s*/g, ' ');
