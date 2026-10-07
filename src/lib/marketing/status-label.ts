import type { MarketingVideo } from '@/types';

// Rótulos em português simples para o dono leigo: sem código de erro.
export function videoStatusLabel(video: Pick<MarketingVideo, 'status' | 'error_kind'>): string {
  switch (video.status) {
    case 'pending': return 'Na fila — sai quando o computador de renderização estiver ligado';
    case 'running': return 'Gerando…';
    case 'done': return 'Pronto';
    default: return video.error_kind === 'photos' ? 'Precisa de atenção' : 'Erro';
  }
}
