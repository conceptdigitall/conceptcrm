import { describe, it, expect } from 'vitest';
import { cleanReplyFormatting } from './clean-formatting';

describe('cleanReplyFormatting', () => {
  it('returns empty string for nullish or empty input', () => {
    expect(cleanReplyFormatting('')).toBe('');
    // @ts-expect-error test falsy edge case
    expect(cleanReplyFormatting(null)).toBe('');
    // @ts-expect-error test falsy edge case
    expect(cleanReplyFormatting(undefined)).toBe('');
  });

  it('removes double asterisks markdown bolding from text', () => {
    const input = 'Aprecio a confiança, mas a gente mantém essa estrutura firme para entregar com excelência. **Sexta às 09h é o mais cedo que consigo oferecer.** Funciona para você?';
    const expected = 'Aprecio a confiança, mas a gente mantém essa estrutura firme para entregar com excelência. Sexta às 09h é o mais cedo que consigo oferecer. Funciona para você?';
    expect(cleanReplyFormatting(input)).toBe(expected);
  });

  it('removes double asterisks in options questions', () => {
    const input = 'Entendo. **Segunda às 09h ou terça?** Qual desses dias te encaixa melhor?';
    const expected = 'Entendo. Segunda às 09h ou terça? Qual desses dias te encaixa melhor?';
    expect(cleanReplyFormatting(input)).toBe(expected);
  });

  it('removes double asterisks in business hour notices', () => {
    const input = 'Segunda às 07h fica fora do nosso horário operacional. **A gente abre segunda às 09h** — consigo te encaixar nesse horário ou prefere terça/quarta/quinta?';
    const expected = 'Segunda às 07h fica fora do nosso horário operacional. A gente abre segunda às 09h — consigo te encaixar nesse horário ou prefere terça/quarta/quinta?';
    expect(cleanReplyFormatting(input)).toBe(expected);
  });

  it('removes single asterisks bolding if present', () => {
    const input = 'Olá! *Segunda às 09h* está disponível.';
    const expected = 'Olá! Segunda às 09h está disponível.';
    expect(cleanReplyFormatting(input)).toBe(expected);
  });

  it('handles multiline bold text with asterisks across lines', () => {
    const input = 'Veja:\n**Segunda às 09h\nou terça**\nPerfeito!';
    const expected = 'Veja:\nSegunda às 09h\nou terça\nPerfeito!';
    expect(cleanReplyFormatting(input)).toBe(expected);
  });

  it('removes any unmatched or stray asterisks', () => {
    const input = 'Aqui está um teste ** e outro * solto';
    const expected = 'Aqui está um teste  e outro  solto';
    expect(cleanReplyFormatting(input)).toBe(expected);
  });

  it('cleans the real portfolio lead reply with malformed markers (2026-09-27)', () => {
    const input = '*Processo é simples:* Fazemos um diagnóstico rápido.\n\nQual é o seu *nome, **empresa* e *principal gargalo* que você enfrenta agora?';
    const expected = 'Processo é simples: Fazemos um diagnóstico rápido.\n\nQual é o seu nome, empresa e principal gargalo que você enfrenta agora?';
    expect(cleanReplyFormatting(input)).toBe(expected);
  });
});
