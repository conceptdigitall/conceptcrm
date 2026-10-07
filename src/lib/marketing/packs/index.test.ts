import { describe, expect, it } from 'vitest';
import { MARKETING_TEMPLATES } from '@/lib/marketing/templates';
import { findButton, getActivePack, getPack } from './index';

describe('registro de pacotes', () => {
  it('conhece a barbearia e não conhece outros nichos', () => {
    expect(getPack('barbearia')?.niche).toBe('barbearia');
    expect(getPack('imobiliaria')).toBeNull();
  });
  it('sem nicho configurado, nenhum pacote fica ativo', () => {
    expect(getActivePack(undefined)).toBeNull();
    expect(getActivePack('')).toBeNull();
    expect(getActivePack('  ')).toBeNull();
    expect(getActivePack('inexistente')).toBeNull();
  });
  it('com nicho configurado, devolve o pacote (ignora maiúsculas e espaços)', () => {
    expect(getActivePack('barbearia')?.niche).toBe('barbearia');
    expect(getActivePack(' Barbearia ')?.niche).toBe('barbearia');
  });
  it('findButton devolve null para botão inexistente', () => {
    const pack = getPack('barbearia')!;
    expect(findButton(pack, 'inexistente')).toBeNull();
  });
});

describe('pacote barbearia', () => {
  const pack = getPack('barbearia')!;
  it('tem os 3 botões do plano', () => {
    expect(pack.buttons.map((b) => b.id)).toEqual(['compilado', 'antes-depois', 'oferta']);
    expect(pack.tone).toBe('polished');
  });
  it('todo botão aponta para um template e um formulário guiado existentes', () => {
    const formIds = MARKETING_TEMPLATES.map((t) => t.id);
    for (const b of pack.buttons) {
      const found = findButton(pack, b.id);
      expect(found?.spec.id).toBe(b.templateId);
      expect(formIds).toContain(b.formId);
      expect(b.directorHint.length).toBeGreaterThan(10);
    }
  });
  it('specs seguem os valores do plano', () => {
    const spec = (id: string) => pack.templates.find((t) => t.id === id)!;
    expect(spec('compilado').photos).toEqual({ min: 4, max: 10 });
    expect(spec('compilado').texts.titulo).toEqual({ maxChars: 40, required: true });
    expect(spec('compilado').texts.subtitulo).toEqual({ maxChars: 60 });
    expect(spec('antes-depois').photos).toEqual({ min: 2, max: 10, multipleOf: 2 });
    expect(spec('oferta').photos).toEqual({ min: 1, max: 6 });
    expect(spec('oferta').texts.price).toEqual({ maxChars: 20, required: true });
    for (const t of pack.templates) expect(t.formats).toEqual(['vertical', 'square']);
  });
});
