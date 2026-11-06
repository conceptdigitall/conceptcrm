import { describe, expect, it } from 'vitest';
import { fileExtension, referenceStatusLabel, shouldPoll } from './reference-view';

describe('reference-view', () => {
  it('traduz o status', () => {
    expect(referenceStatusLabel('pending')).toBe('Na fila');
    expect(referenceStatusLabel('running')).toBe('Analisando');
    expect(referenceStatusLabel('done')).toBe('Pronto');
    expect(referenceStatusLabel('failed')).toBe('Erro');
  });
  it('só faz polling com pendente ou rodando', () => {
    expect(shouldPoll([])).toBe(false);
    expect(shouldPoll([{ status: 'done' }, { status: 'failed' }])).toBe(false);
    expect(shouldPoll([{ status: 'done' }, { status: 'running' }])).toBe(true);
    expect(shouldPoll([{ status: 'pending' }])).toBe(true);
  });
  it('extrai a extensão', () => {
    expect(fileExtension('Meu Video.MOV')).toBe('mov');
    expect(fileExtension('semext')).toBe('');
    expect(fileExtension('x.')).toBe('');
  });
});
