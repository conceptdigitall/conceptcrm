import { describe, expect, it, vi } from 'vitest';
import { estimateWords, narrationProvider, synthesizeGemini } from './narration-gemini';

describe('narrationProvider', () => {
  it('usa o Gemini só quando NARRATION_PROVIDER=gemini', () => {
    expect(narrationProvider({ NARRATION_PROVIDER: 'gemini' })).toBe('gemini');
  });

  it('fica no ElevenLabs por padrão', () => {
    expect(narrationProvider({})).toBe('elevenlabs');
    expect(narrationProvider({ NARRATION_PROVIDER: 'outro' })).toBe('elevenlabs');
  });
});

describe('estimateWords', () => {
  it('cobre o texto em ordem, do início ao fim do áudio', () => {
    const words = estimateWords('Seu cliente atendido na hora.', 3);
    expect(words.map((w) => w.word)).toEqual(['Seu', 'cliente', 'atendido', 'na', 'hora.']);
    expect(words[0].start).toBe(0);
    expect(words.at(-1)!.end).toBeCloseTo(3, 5);
    for (let i = 0; i < words.length; i++) {
      expect(words[i].end).toBeGreaterThan(words[i].start);
      if (i > 0) expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].end);
    }
  });

  it('dá mais tempo para palavra mais longa', () => {
    const [curta, longa] = estimateWords('na recepcionista', 2);
    expect(longa.end - longa.start).toBeGreaterThan(curta.end - curta.start);
  });

  it('deixa uma pausa depois de ponto e de vírgula', () => {
    const words = estimateWords('Ninguém respondeu. Agora, responde na hora', 4);
    const gap = (i: number) => words[i + 1].start - words[i].end;
    expect(gap(1)).toBeGreaterThan(0.1); // "respondeu."
    expect(gap(2)).toBeGreaterThan(0.05); // "Agora,"
    expect(gap(3)).toBe(0);
  });

  it('devolve lista vazia para texto vazio', () => {
    expect(estimateWords('   ', 2)).toEqual([]);
  });
});

describe('synthesizeGemini', () => {
  const wav = Buffer.from('RIFF-fake');

  it('gera o áudio, converte e estima os tempos das palavras', async () => {
    const tts = vi.fn().mockResolvedValue(wav);
    const encode = vi.fn().mockResolvedValue({ audio: Buffer.from('mp3'), duration: 2.5 });
    const n = await synthesizeGemini('Atendimento na hora.', { tts, encode });
    expect(tts).toHaveBeenCalledWith('Atendimento na hora.');
    expect(encode).toHaveBeenCalledWith(wav);
    expect(n.audio.toString()).toBe('mp3');
    expect(n.text).toBe('Atendimento na hora.');
    expect(n.duration).toBe(2.5);
    expect(n.words.map((w) => w.word)).toEqual(['Atendimento', 'na', 'hora.']);
    expect(n.words.at(-1)!.end).toBeCloseTo(2.5, 5);
  });

  it('falha se o TTS não devolve áudio', async () => {
    const tts = vi.fn().mockResolvedValue(Buffer.alloc(0));
    const encode = vi.fn();
    await expect(synthesizeGemini('Oi', { tts, encode })).rejects.toThrow(/sem áudio/);
    expect(encode).not.toHaveBeenCalled();
  });
});
