import { REFERENCE_ERROR_TOO_LONG, REFERENCE_UPLOAD_MAX_BYTES } from '@/lib/marketing/references';
import type { MarketingReference, ReferenceEixo, ReferenceStatus } from '@/types';

const STATUS_LABEL: Record<ReferenceStatus, string> = {
  pending: 'Na fila',
  running: 'Analisando',
  done: 'Pronto',
  failed: 'Erro',
};

export function referenceStatusLabel(status: ReferenceStatus): string {
  return STATUS_LABEL[status] ?? 'Erro';
}

export const EIXO_LABEL: Record<ReferenceEixo, string> = {
  como_falar: 'Como falar (IA e negócios)',
  sobre_o_que: 'Sobre o que (nicho do cliente)',
};

/** Só vale atualizar a lista sozinho enquanto alguma análise ainda não terminou. */
export function shouldPoll(refs: Pick<MarketingReference, 'status'>[]): boolean {
  return refs.some((r) => r.status === 'pending' || r.status === 'running');
}

/**
 * "Analisar de novo" só serve quando há o que reanalisar: upload sem arquivo
 * (apagado após a falha) e vídeo longo demais falhariam outra vez.
 */
export function canRetry(
  ref: Pick<MarketingReference, 'status' | 'url' | 'arquivo_path' | 'error'>,
): boolean {
  if (ref.status !== 'failed') return false;
  if (ref.url.startsWith('upload:') && !ref.arquivo_path) return false;
  return ref.error !== REFERENCE_ERROR_TOO_LONG;
}

/** Extensão do nome do arquivo, sem ponto; '' se não houver. */
export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
}

/** Confere tipo e tamanho do arquivo antes de pedir o envio; devolve a mensagem de erro ou null. */
export function validateReferenceFile(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith('video/')) return 'O arquivo precisa ser um vídeo.';
  if (file.size <= 0) return 'O arquivo está vazio.';
  if (file.size > REFERENCE_UPLOAD_MAX_BYTES) return 'O vídeo passa de 100 MB. Envie um menor.';
  return null;
}

/** Texto das views -> número inteiro; vazio -> null; qualquer outra coisa -> 'invalid'. */
export function parseViewsInput(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return 'invalid';
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : 'invalid';
}

/**
 * Roda `fn` uma vez por vez. Chamadas feitas durante uma execução viram UMA
 * execução seguinte (nunca são descartadas), e a promessa devolvida só resolve
 * depois da execução que reflete aquele pedido.
 */
export function createCoalescedLoader(fn: () => Promise<void>): () => Promise<void> {
  let current: Promise<void> | null = null;
  let queued: Promise<void> | null = null;

  function trigger(): Promise<void> {
    if (!current) {
      const run = (async () => {
        try {
          await fn();
        } finally {
          current = null;
        }
      })();
      current = run;
      return run;
    }
    if (!queued) {
      queued = current
        .catch(() => undefined)
        .then(() => {
          queued = null;
          return trigger();
        });
    }
    return queued;
  }

  return trigger;
}
