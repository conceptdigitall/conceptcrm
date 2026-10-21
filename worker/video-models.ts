// Modelos Claude usados no vídeo. VIDEO_MODEL também escolhe o motor do modo livre (video.ts) e
// pode ser Gemini; diretor e checagem de foto chamam a Anthropic e só aceitam modelos claude-*.

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

type Env = Record<string, string | undefined>;

const isClaude = (model?: string): model is string => !!model?.startsWith('claude-');

/** Diretor dos pacotes: o VIDEO_MODEL quando é Claude, senão Haiku. */
export function directorModel(env: Env = process.env): string {
  return isClaude(env.VIDEO_MODEL) ? env.VIDEO_MODEL : HAIKU_MODEL;
}

/** Foto escura/borrada é tarefa simples: fica no Haiku, salvo VIDEO_VISION_MODEL. */
export function visionModel(env: Env = process.env): string {
  return isClaude(env.VIDEO_VISION_MODEL) ? env.VIDEO_VISION_MODEL : HAIKU_MODEL;
}

// Modelos que aceitam o fallback de recusa no servidor (fallbacks: 'default').
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

/** Parâmetros do fallback de recusa: se o modelo recusar, a própria API tenta outro na mesma chamada. */
export function serverFallback(model: string): { betas?: string[]; fallbacks?: 'default' } {
  return FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
}
