/**
 * Busca de tendências e notícias recentes na web para alimentar o roteiro e a pauta.
 * Gratuita, sem dependência de cartão: usa DuckDuckGo HTML como base resiliente,
 * com fallback/suporte opcional ao Google Search Grounding via Gemini.
 */

export interface TrendItem {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeHtml(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function cleanUrl(raw: string): string {
  try {
    if (raw.includes('uddg=')) {
      const parsed = new URL(raw.startsWith('http') ? raw : `https://duckduckgo.com${raw}`);
      return decodeURIComponent(parsed.searchParams.get('uddg') || raw);
    }
    return raw;
  } catch {
    return raw;
  }
}

/**
 * Busca ao vivo no DuckDuckGo (HTML). Gratuito, sem API key, tolerante a falhas de rede.
 */
export async function searchDuckDuckGo(query: string, maxResults = 5, fetchFn: typeof fetch = fetch): Promise<TrendItem[]> {
  const q = query.trim();
  if (!q) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetchFn(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!res.ok) return [];
    const html = await res.text();

    const items: TrendItem[] = [];
    const blocks = html.split(/<div class="[^"]*result[^"]*"/).slice(1);

    for (const b of blocks) {
      if (items.length >= maxResults) break;
      const titleMatch = b.match(/class="result__title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

      if (titleMatch) {
        const rawUrl = titleMatch[1];
        const rawTitle = titleMatch[2];
        const rawSnippet = snippetMatch ? snippetMatch[1] : '';

        const title = decodeHtml(rawTitle);
        const snippet = decodeHtml(rawSnippet);
        const url = cleanUrl(rawUrl);

        if (title && (url.startsWith('http://') || url.startsWith('https://'))) {
          let source = 'web';
          try {
            source = new URL(url).hostname.replace(/^www\./, '');
          } catch {}
          items.push({ title, snippet, url, source });
        }
      }
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca tendências e notícias recentes ancoradas no nicho informado.
 */
export async function fetchMarketTrends(niche?: string, fetchFn: typeof fetch = fetch): Promise<TrendItem[]> {
  const target = niche?.trim() || 'pequenos negócios';
  const query = `${target} atendimento whatsapp inteligência artificial brasil novidades`;
  return searchDuckDuckGo(query, 5, fetchFn);
}
