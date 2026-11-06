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

/** Extensão do nome do arquivo, sem ponto; '' se não houver. */
export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
}
