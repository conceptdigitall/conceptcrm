// Cliente da publicação no Instagram: a rota responde 202 e a Meta processa em
// segundo plano (um Reel leva 1-3 min). Aqui a tela dispara e acompanha o andamento.
import type { PostStatus } from '@/types';

export interface PublishProgress {
  status: PostStatus;
  error_message: string | null;
  instagram_media_id: string | null;
  instagram_permalink: string | null;
  posted_at: string | null;
  stale: boolean;
}

export interface PublishPollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_INTERVAL_MS = 3000;
// Um pouco acima do teto da rota (5 min): depois disso a rota já desistiu sozinha.
const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000;

export class PublishTimeoutError extends Error {
  constructor() {
    super('A Meta ainda está processando. Recarregue a página em instantes para ver o resultado.');
    this.name = 'PublishTimeoutError';
  }
}

/** Reserva o post e inicia a publicação. Lança com a mensagem da rota se for recusada. */
export async function startPublish(postId: string, extra: Record<string, unknown> = {}): Promise<void> {
  const res = await fetch('/api/marketing/instagram/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, ...extra }),
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(data?.error || 'Erro ao publicar no Instagram');
}

/**
 * Consulta até o post sair de 'publishing' (ou ficar preso). Falha de rede no meio
 * do caminho não interrompe: a publicação segue no servidor, então só tenta de novo.
 */
export async function waitForPublish(postId: string, options: PublishPollOptions = {}): Promise<PublishProgress> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    try {
      const res = await fetch(`/api/marketing/instagram/publish?postId=${encodeURIComponent(postId)}`, {
        signal: options.signal,
      });
      if (res.ok) {
        const progress = (await res.json()) as PublishProgress;
        if (progress.status !== 'publishing' || progress.stale) return progress;
      } else if (res.status === 404) {
        throw new Error('Post não encontrado');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (err instanceof Error && err.message === 'Post não encontrado') throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new PublishTimeoutError();
}
