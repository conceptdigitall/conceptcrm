import { describe, expect, it } from 'vitest';
import { MIN_SHORT_SIDE, checkResolution } from './photo-check';

describe('checkResolution', () => {
  it('usa 720 px como lado menor mínimo', () => {
    expect(MIN_SHORT_SIDE).toBe(720);
  });
  it('aponta só as fotos pequenas, numerando a partir de 1', () => {
    const msgs = checkResolution([
      { width: 1080, height: 1350 },
      { width: 719, height: 2000 },
      { width: 1600, height: 600 },
    ]);
    expect(msgs).toEqual([
      'A foto 2 está pequena demais (mínimo 720 px no lado menor)',
      'A foto 3 está pequena demais (mínimo 720 px no lado menor)',
    ]);
  });
  it('aceita exatamente 720 px e lista vazia', () => {
    expect(checkResolution([{ width: 720, height: 720 }])).toEqual([]);
    expect(checkResolution([])).toEqual([]);
  });
});
