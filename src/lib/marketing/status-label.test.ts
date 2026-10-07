import { describe, expect, it } from 'vitest';
import { videoStatusLabel } from './status-label';

describe('videoStatusLabel', () => {
  it('na fila avisa que depende do computador de renderização', () => {
    expect(videoStatusLabel({ status: 'pending', error_kind: null }))
      .toBe('Na fila — sai quando o computador de renderização estiver ligado');
  });
  it('gerando e pronto', () => {
    expect(videoStatusLabel({ status: 'running', error_kind: null })).toBe('Gerando…');
    expect(videoStatusLabel({ status: 'done', error_kind: null })).toBe('Pronto');
  });
  it('foto com problema vira "Precisa de atenção"', () => {
    expect(videoStatusLabel({ status: 'failed', error_kind: 'photos' })).toBe('Precisa de atenção');
  });
  it('outras falhas viram "Erro"', () => {
    expect(videoStatusLabel({ status: 'failed', error_kind: 'render' })).toBe('Erro');
    expect(videoStatusLabel({ status: 'failed', error_kind: 'director' })).toBe('Erro');
    expect(videoStatusLabel({ status: 'failed', error_kind: null })).toBe('Erro');
  });
});
