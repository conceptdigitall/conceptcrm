import { describe, expect, it, vi } from 'vitest';
import { searchDuckDuckGo, fetchMarketTrends } from './trends-search';

describe('trends-search', () => {
  it('retorna vazio quando a query for vazia', async () => {
    const res = await searchDuckDuckGo('');
    expect(res).toEqual([]);
  });

  it('faz parse correto do HTML do DuckDuckGo', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="result result--trad">
            <h2 class="result__title">
              <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexemplo.com%2Fnoticia">Título da <b>Notícia</b> &amp; Tendência</a>
            </h2>
            <a class="result__snippet" href="#">Snippet da notícia com &quot;aspas&quot; e detalhes.</a>
          </div>
        </body>
      </html>
    `;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as unknown as Response);

    const res = await searchDuckDuckGo('barbearia brasil', 5, mockFetch as unknown as typeof fetch);

    expect(res.length).toBe(1);
    expect(res[0].title).toBe('Título da Notícia & Tendência');
    expect(res[0].snippet).toBe('Snippet da notícia com "aspas" e detalhes.');
    expect(res[0].url).toBe('https://exemplo.com/noticia');
    expect(res[0].source).toBe('exemplo.com');
  });

  it('fetchMarketTrends formula a query adequada com nicho', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    } as unknown as Response);

    await fetchMarketTrends('barbearia', mockFetch as unknown as typeof fetch);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('barbearia'),
      expect.anything(),
    );
  });

  it('lida graciosamente com falha de rede', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
    const res = await searchDuckDuckGo('teste', 5, mockFetch as unknown as typeof fetch);
    expect(res).toEqual([]);
  });
});
