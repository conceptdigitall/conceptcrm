import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { checkPhotoQuality, parseVisionReply, photoDimensions } from './photo-vision';

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#777' } }).jpeg().toBuffer();

describe('parseVisionReply', () => {
  it('lê um array JSON em bloco de código ou solto', () => {
    expect(parseVisionReply('```json\n["ok","escura"]\n```', 2)).toEqual(['ok', 'escura']);
    expect(parseVisionReply('["ok","borrada","ok"]', 3)).toEqual(['ok', 'borrada', 'ok']);
  });
  it('lança erro se o tamanho não bate ou há valor desconhecido', () => {
    expect(() => parseVisionReply('["ok"]', 2)).toThrow();
    expect(() => parseVisionReply('["ok","azul"]', 2)).toThrow();
    expect(() => parseVisionReply('não sei', 1)).toThrow();
  });
});

describe('photoDimensions', () => {
  it('devolve largura e altura de cada imagem', async () => {
    const dims = await photoDimensions([await jpeg(800, 600), await jpeg(300, 900)]);
    expect(dims).toEqual([{ width: 800, height: 600 }, { width: 300, height: 900 }]);
  });
});

describe('checkPhotoQuality', () => {
  it('gera uma mensagem por foto escura ou borrada, com o número certo', async () => {
    const classify = vi.fn().mockResolvedValue(['ok', 'escura', 'borrada']);
    const files = [await jpeg(900, 900), await jpeg(900, 900), await jpeg(900, 900)];
    const msgs = await checkPhotoQuality({ classify }, files);
    expect(msgs).toEqual([
      'A foto 2 está escura, quer trocar?',
      'A foto 3 está borrada, quer trocar?',
    ]);
  });
  it('devolve lista vazia quando tudo está ok', async () => {
    const classify = vi.fn().mockResolvedValue(['ok']);
    expect(await checkPhotoQuality({ classify }, [await jpeg(900, 900)])).toEqual([]);
  });
  it('reduz cada imagem para no máximo 1024 px antes de classificar', async () => {
    const classify = vi.fn().mockResolvedValue(['ok']);
    await checkPhotoQuality({ classify }, [await jpeg(3000, 2000)]);
    const sent = classify.mock.calls[0][0] as Buffer[];
    const meta = await sharp(sent[0]).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1024);
  });
  it('propaga erro se o classificador devolver tamanho errado (não aprova em silêncio)', async () => {
    const classify = vi.fn().mockResolvedValue(['ok', 'ok']);
    await expect(checkPhotoQuality({ classify }, [await jpeg(900, 900)])).rejects.toThrow();
  });
});
