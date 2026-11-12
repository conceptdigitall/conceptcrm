import { describe, expect, it, vi } from 'vitest';
import { alignToPauses, estimateWords, narrationProvider, parseSilences, synthesizeGemini } from './narration-gemini';

describe('narrationProvider', () => {
  it('usa o ElevenLabs só quando NARRATION_PROVIDER=elevenlabs', () => {
    expect(narrationProvider({ NARRATION_PROVIDER: 'elevenlabs' })).toBe('elevenlabs');
  });

  it('fica no Gemini por padrão', () => {
    expect(narrationProvider({})).toBe('gemini');
    expect(narrationProvider({ NARRATION_PROVIDER: 'outro' })).toBe('gemini');
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

describe('parseSilences', () => {
  it('lê os intervalos de silêncio do stderr do ffmpeg silencedetect', () => {
    const err = [
      '[silencedetect @ 0x1] silence_start: 1.204',
      '[silencedetect @ 0x1] silence_end: 1.62 | silence_duration: 0.416',
      'lixo qualquer',
      '[silencedetect @ 0x1] silence_start: 3.5',
      '[silencedetect @ 0x1] silence_end: 3.9 | silence_duration: 0.4',
      '[silencedetect @ 0x1] silence_start: 5.1',
    ].join('\n');
    expect(parseSilences(err, 5.3)).toEqual([
      { start: 1.204, end: 1.62 },
      { start: 3.5, end: 3.9 },
      { start: 5.1, end: 5.3 },
    ]);
  });

  it('devolve lista vazia sem silêncios', () => {
    expect(parseSilences('nada aqui', 4)).toEqual([]);
  });
});

describe('alignToPauses', () => {
  const text = 'Ele não existe. O cliente procura, e não encontra. Agenda no papel.';

  it('ancora o fim de cada frase no começo da pausa real', () => {
    const words = alignToPauses(text, 7, [{ start: 1.5, end: 2.1 }, { start: 3.0, end: 3.3 }, { start: 4.6, end: 5.2 }]);
    const at = (w: string) => words.find((x) => x.word === w)!;
    expect(at('existe.').end).toBeCloseTo(1.5, 5);
    expect(at('O').start).toBeCloseTo(2.1, 5);
    expect(at('procura,').end).toBeCloseTo(3.0, 5);
    expect(at('encontra.').end).toBeCloseTo(4.6, 5);
    expect(at('Agenda').start).toBeCloseTo(5.2, 5);
    expect(words.at(-1)!.end).toBeCloseTo(7, 5);
  });

  it('mantém as palavras em ordem e sem sobreposição', () => {
    const words = alignToPauses(text, 7, [{ start: 1.5, end: 2.1 }, { start: 4.6, end: 5.2 }]);
    expect(words.map((w) => w.word)).toEqual(text.split(' '));
    for (let i = 1; i < words.length; i++) expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].end - 1e-9);
  });

  it('ignora pausa que não bate com nenhuma pontuação', () => {
    // pausa no meio de uma frase longa sem vírgula: não deve puxar fim de frase para lá
    const words = alignToPauses('Ele é o melhor barbeiro do bairro inteiro. Mas some.', 4, [{ start: 0.6, end: 0.8 }, { start: 2.9, end: 3.2 }]);
    const fim = words.find((w) => w.word === 'inteiro.')!;
    expect(fim.end).toBeCloseTo(2.9, 5);
  });

  it('sem pausa medida, cai na estimativa', () => {
    expect(alignToPauses(text, 7, [])).toEqual(estimateWords(text, 7));
  });
});

describe('synthesizeGemini com pausas medidas', () => {
  it('usa os silêncios do encode para alinhar as palavras', async () => {
    const tts = vi.fn().mockResolvedValue(Buffer.from('RIFF'));
    const encode = vi.fn().mockResolvedValue({ audio: Buffer.from('mp3'), duration: 3, silences: [{ start: 1.2, end: 1.6 }] });
    const n = await synthesizeGemini('Cadeira vazia. Cliente feliz.', { tts, encode });
    expect(n.words.find((w) => w.word === 'vazia.')!.end).toBeCloseTo(1.2, 5);
    expect(n.words.find((w) => w.word === 'Cliente')!.start).toBeCloseTo(1.6, 5);
  });
});
