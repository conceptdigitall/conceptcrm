import { describe, expect, it } from 'vitest';
import { createCoalescedLoader, parseViewsInput, validateReferenceFile, fileExtension, referenceStatusLabel, shouldPoll } from './reference-view';

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
  it('coalesce chamadas feitas durante uma execução em uma só execução seguinte', async () => {
    let calls = 0;
    const gates: Array<() => void> = [];
    const loader = createCoalescedLoader(
      () =>
        new Promise<void>((resolve) => {
          calls++;
          gates.push(resolve);
        }),
    );
    const first = loader();
    expect(calls).toBe(1);
    const a = loader();
    const b = loader();
    const c = loader();
    expect(calls).toBe(1);
    gates[0]();
    await first;
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    gates[1]();
    await Promise.all([a, b, c]);
    expect(calls).toBe(2);
    // sem nada em andamento, uma nova chamada roda direto
    const d = loader();
    expect(calls).toBe(3);
    gates[2]();
    await d;
  });
  it('a execução seguinte ainda roda se a anterior falhar', async () => {
    let calls = 0;
    const loader = createCoalescedLoader(async () => {
      calls++;
      if (calls === 1) throw new Error('x');
    });
    const first = loader();
    const second = loader();
    await expect(first).rejects.toThrow();
    await second;
    expect(calls).toBe(2);
  });
});
