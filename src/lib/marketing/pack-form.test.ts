import { describe, expect, it } from 'vitest';
import { getPack } from '@/lib/marketing/packs';
import { packFormState } from './pack-form';

const pack = getPack('barbearia')!;
const base = {
  pack,
  buttonId: 'compilado',
  fields: { name: 'Degradê', benefit: 'Na régua' },
  fileCount: 4,
  formats: ['vertical' as const],
  videosToday: 0,
};

describe('packFormState', () => {
  it('libera quando tudo está preenchido', () => {
    expect(packFormState(base)).toEqual({ ok: true, reason: null });
  });
  it('pede o campo obrigatório que falta', () => {
    const r = packFormState({ ...base, fields: { name: '  ' } });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Preencha');
  });
  it('pede mais fotos quando abaixo do mínimo do modelo', () => {
    const r = packFormState({ ...base, fileCount: 3 });
    expect(r).toMatchObject({ ok: false });
    expect(r.reason).toContain('de 4 a 10');
  });
  it('antes e depois exige número par de fotos', () => {
    const r = packFormState({ ...base, buttonId: 'antes-depois', fileCount: 3 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('múltiplo de 2');
    expect(packFormState({ ...base, buttonId: 'antes-depois', fileCount: 4 }).ok).toBe(true);
  });
  it('exige ao menos um formato', () => {
    expect(packFormState({ ...base, formats: [] })).toMatchObject({ ok: false, reason: 'Escolha 9:16 e/ou 1:1' });
  });
  it('bloqueia quando os novos vídeos passariam do limite do dia', () => {
    const r = packFormState({ ...base, formats: ['vertical', 'square'], videosToday: 9 });
    expect(r).toMatchObject({ ok: false });
    expect(r.reason).toContain('Limite');
    expect(packFormState({ ...base, formats: ['vertical', 'square'], videosToday: 8 }).ok).toBe(true);
  });
  it('botão desconhecido não libera', () => {
    expect(packFormState({ ...base, buttonId: 'x' })).toMatchObject({ ok: false });
  });
});
