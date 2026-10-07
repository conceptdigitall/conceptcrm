import { describe, expect, it } from 'vitest';
import { validateDirectorOutput, validateFieldLimits, type TemplateSpec } from './types';

const spec: TemplateSpec = {
  id: 'compilado',
  name: 'Compilado',
  formats: ['vertical', 'square'],
  photos: { min: 4, max: 10 },
  texts: { titulo: { maxChars: 40, required: true }, cta: { maxChars: 40 } },
};

const valid = {
  templateId: 'compilado',
  photoOrder: [2, 0, 1, 3],
  texts: { titulo: 'Os cortes da semana' },
  caption: 'Corte novo toda semana. Agende pelo WhatsApp!',
  hashtags: ['#barbearia', '#corte'],
};

describe('validateDirectorOutput', () => {
  it('aceita uma saída válida', () => {
    const r = validateDirectorOutput(spec, 4, valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.photoOrder).toEqual([2, 0, 1, 3]);
  });
  it('recusa templateId diferente do template', () => {
    const r = validateDirectorOutput(spec, 4, { ...valid, templateId: 'oferta' });
    expect(r.ok).toBe(false);
  });
  it('recusa photoOrder que não é permutação de 0..n-1', () => {
    expect(validateDirectorOutput(spec, 4, { ...valid, photoOrder: [0, 0, 1, 2] }).ok).toBe(false);
    expect(validateDirectorOutput(spec, 4, { ...valid, photoOrder: [0, 1, 2] }).ok).toBe(false);
    expect(validateDirectorOutput(spec, 4, { ...valid, photoOrder: [0, 1, 2, 4] }).ok).toBe(false);
  });
  it('recusa quantidade de fotos fora de 4–10', () => {
    const three = { ...valid, photoOrder: [0, 1, 2] };
    expect(validateDirectorOutput(spec, 3, three).ok).toBe(false);
    const eleven = { ...valid, photoOrder: Array.from({ length: 11 }, (_, i) => i) };
    expect(validateDirectorOutput(spec, 11, eleven).ok).toBe(false);
  });
  it('recusa titulo com 41 caracteres e titulo ausente', () => {
    const long = validateDirectorOutput(spec, 4, { ...valid, texts: { titulo: 'x'.repeat(41) } });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors.join(' ')).toContain('titulo');
    expect(validateDirectorOutput(spec, 4, { ...valid, texts: {} }).ok).toBe(false);
  });
  it('com multipleOf 2 recusa 5 fotos e aceita 4', () => {
    const pairs: TemplateSpec = { ...spec, photos: { min: 2, max: 10, multipleOf: 2 } };
    const five = { ...valid, photoOrder: [0, 1, 2, 3, 4] };
    expect(validateDirectorOutput(pairs, 5, five).ok).toBe(false);
    expect(validateDirectorOutput(pairs, 4, valid).ok).toBe(true);
  });
  it('recusa chave de texto que o template não declara', () => {
    const r = validateDirectorOutput(spec, 4, { ...valid, texts: { titulo: 'ok', preco: 'R$ 1' } });
    expect(r.ok).toBe(false);
  });
  it('recusa caption vazia ou acima de 2200 caracteres', () => {
    expect(validateDirectorOutput(spec, 4, { ...valid, caption: '' }).ok).toBe(false);
    expect(validateDirectorOutput(spec, 4, { ...valid, caption: 'a'.repeat(2201) }).ok).toBe(false);
  });
  it('recusa mais de 15 hashtags', () => {
    const tags = Array.from({ length: 16 }, (_, i) => `#t${i}`);
    expect(validateDirectorOutput(spec, 4, { ...valid, hashtags: tags }).ok).toBe(false);
  });
  it('recusa entrada que não é objeto', () => {
    expect(validateDirectorOutput(spec, 4, null).ok).toBe(false);
    expect(validateDirectorOutput(spec, 4, 'texto').ok).toBe(false);
  });
});

describe('validateFieldLimits', () => {
  it('devolve erro em português para texto longo e obrigatório ausente', () => {
    const errors = validateFieldLimits(spec, { titulo: 'x'.repeat(41) });
    expect(errors).toEqual(['titulo passa de 40 caracteres']);
    expect(validateFieldLimits(spec, {})).toEqual(['titulo é obrigatório']);
  });
  it('não reclama de campo opcional vazio', () => {
    expect(validateFieldLimits(spec, { titulo: 'ok', cta: '' })).toEqual([]);
  });
});
