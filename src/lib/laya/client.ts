import type { LayaAnswer, LayaQuestion } from '@/lib/prospecting/columns';

export const LAYA_MODEL = 'multilingual';
const QUESTION_KEY = 'col';

export interface LayaClientDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  /** Sent as `Authorization: Bearer`; laya-serve requires it when LAYA_API_KEY is set. */
  apiKey?: string;
  /** Abort each attempt after this long: a Laya reached through a tunnel can hang. */
  timeoutMs?: number;
}

// POST to laya-serve with the key, a timeout and the 503 retry. Returns the parsed JSON.
async function callLaya<T>(baseUrl: string, path: string, payload: unknown, deps: LayaClientDeps): Promise<T> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxAttempts = deps.maxAttempts ?? 3;
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = deps.apiKey ?? process.env.LAYA_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal: deps.timeoutMs ? AbortSignal.timeout(deps.timeoutMs) : undefined,
      });
    } catch (err) {
      if ((err as Error)?.name === 'TimeoutError') throw new Error('Laya não respondeu a tempo');
      throw new Error('Laya desligado: rode npm run laya');
    }
    if (res.status === 401) throw new Error('Laya recusou a chave: confira LAYA_API_KEY');
    if (res.status === 404) throw new Error(`Laya sem a rota ${path}: suba o servidor com worker/laya/serve.sh`);
    if (res.status === 503) {
      if (attempt >= maxAttempts) throw new Error('Laya ocupado: tente de novo em instantes');
      const seconds = Number(res.headers.get('Retry-After'));
      await sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
      continue;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Laya respondeu ${res.status}: ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }
}

// One call to laya-serve for a batch of lead texts and a single question.
export async function layaBatch(
  baseUrl: string, states: string[], question: LayaQuestion, deps: LayaClientDeps = {},
): Promise<LayaAnswer[]> {
  const json = await callLaya<{ results?: { answers?: Record<string, LayaAnswer> }[] }>(
    baseUrl, '/v1/systemone/batch', { states, questions: { [QUESTION_KEY]: question }, model: LAYA_MODEL }, deps,
  );
  const results = json.results ?? [];
  if (results.length !== states.length) {
    throw new Error(`Laya devolveu ${results.length} respostas para ${states.length} linhas`);
  }
  return results.map((r) => {
    const answer = r.answers?.[QUESTION_KEY];
    if (!answer) throw new Error('Resposta do Laya sem a coluna');
    return answer;
  });
}

export const EMBED_BATCH = 32;

// Encoder vectors (mean of Laya's encoder, 768 numbers) from worker/laya/serve_plus.py.
export async function layaEmbed(baseUrl: string, texts: string[], deps: LayaClientDeps = {}): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const chunk = texts.slice(i, i + EMBED_BATCH);
    const json = await callLaya<{ vectors?: number[][] }>(baseUrl, '/v1/embed', { texts: chunk }, deps);
    if (json.vectors?.length !== chunk.length) {
      throw new Error(`Laya devolveu ${json.vectors?.length ?? 0} vetores para ${chunk.length} textos`);
    }
    out.push(...json.vectors);
  }
  return out;
}
