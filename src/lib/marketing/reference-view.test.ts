import { describe, expect, it } from 'vitest';
import { parseViewsInput, validateReferenceFile, fileExtension, referenceStatusLabel, shouldPoll } from './reference-view';

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
  it('valida tipo e tamanho do arquivo', () => {
    expect(validateReferenceFile({ type: 'video/mp4', size: 1000 })).toBeNull();
    expect(validateReferenceFile({ type: 'image/png', size: 1000 })).toMatch(/vídeo/);
    expect(validateReferenceFile({ type: '', size: 1000 })).toMatch(/vídeo/);
    expect(validateReferenceFile({ type: 'video/mp4', size: 0 })).not.toBeNull();
    expect(validateReferenceFile({ type: 'video/mp4', size: 100 * 1024 * 1024 })).toBeNull();
    expect(validateReferenceFile({ type: 'video/mp4', size: 100 * 1024 * 1024 + 1 })).toMatch(/100 MB/);
  });
  it('converte views em número', () => {
    expect(parseViewsInput('')).toBeNull();
    expect(parseViewsInput('  ')).toBeNull();
    expect(parseViewsInput('250000')).toBe(250000);
    expect(parseViewsInput(' 12 ')).toBe(12);
    expect(parseViewsInput('1,5')).toBe('invalid');
    expect(parseViewsInput('abc')).toBe('invalid');
    expect(parseViewsInput('99999999999999999999')).toBe('invalid');
  });
});
