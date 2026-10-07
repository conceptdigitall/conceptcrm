import { describe, expect, it, vi } from 'vitest';
import { findButton, getPack } from '@/lib/marketing/packs';
import { DirectorError, runDirector, type DirectorInput } from './director';

const pack = getPack('barbearia')!;
const { button, spec } = findButton(pack, 'compilado')!;
const input: DirectorInput = {
  pack, button, spec,
  fields: { name: 'Degradê navalhado', benefit: 'Acabamento na régua' },
  photoCount: 4,
  businessName: 'Barbearia do Alemão',
};

const good = {
  templateId: 'compilado',
  photoOrder: [1, 0, 2, 3],
  texts: { titulo: 'Degradê na régua', subtitulo: 'Acabamento que se vê', cta: 'Agende pelo WhatsApp' },
  caption: 'Degradê navalhado com acabamento na régua. Agende seu horário!',
  hashtags: ['#barbearia', '#degrade'],
};
const block = (o: unknown) => '```json\n' + JSON.stringify(o) + '\n```';

describe('runDirector', () => {
  it('devolve o objeto quando a resposta em bloco json é válida', async () => {
    const ask = vi.fn().mockResolvedValue(block(good));
    const out = await runDirector({ ask }, input);
    expect(out).toEqual(good);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('tenta de novo com a lista de erros e aceita a segunda resposta', async () => {
    const bad = { ...good, texts: { ...good.texts, titulo: 'x'.repeat(41) } };
    const ask = vi.fn().mockResolvedValueOnce(block(bad)).mockResolvedValueOnce(block(good));
    const out = await runDirector({ ask }, input);
    expect(out).toEqual(good);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][1]).toContain('titulo passa de 40 caracteres');
  });

  it('lança DirectorError em português depois de duas respostas inválidas', async () => {
    const bad = { ...good, photoOrder: [0, 0, 1, 2] };
    const ask = vi.fn().mockResolvedValue(block(bad));
    const err = await runDirector({ ask }, input).catch((e) => e);
    expect(err).toBeInstanceOf(DirectorError);
    expect(err.message).toMatch(/roteiro/i);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('recusa marcação HTML dentro de textos e da legenda', async () => {
    const withHtml = { ...good, texts: { ...good.texts, subtitulo: '<style>body{display:none}</style>' } };
    const ask = vi.fn().mockResolvedValueOnce(block(withHtml)).mockResolvedValueOnce(block(good));
    await runDirector({ ask }, input);
    expect(ask.mock.calls[1][1]).toContain('HTML');
    const capHtml = { ...good, caption: 'Oi <script>x</script>' };
    const ask2 = vi.fn().mockResolvedValue(block(capHtml));
    await expect(runDirector({ ask: ask2 }, input)).rejects.toBeInstanceOf(DirectorError);
  });

  it('trata resposta sem JSON como inválida e tenta de novo', async () => {
    const ask = vi.fn().mockResolvedValueOnce('desculpe, não consigo').mockResolvedValueOnce(block(good));
    expect(await runDirector({ ask }, input)).toEqual(good);
  });

  it('põe no prompt de sistema a dica do botão, os limites e a regra de não inventar', async () => {
    const ask = vi.fn().mockResolvedValue(block(good));
    await runDirector({ ask }, input);
    const [system, user] = ask.mock.calls[0] as [string, string];
    expect(system).toContain(button.directorHint);
    expect(system).toContain('titulo');
    expect(system).toContain('40');
    expect(system).toMatch(/não invente/i);
    expect(user).toContain('Degradê navalhado');
    expect(user).toContain('Barbearia do Alemão');
    expect(user).toContain('4');
  });
});
