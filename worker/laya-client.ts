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

// One call to laya-serve for a batch of lead texts and a single question.
export async function layaBatch(
  baseUrl: string, states: string[], question: LayaQuestion, deps: LayaClientDeps = {},
): Promise<LayaAnswer[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxAttempts = deps.maxAttempts ?? 3;
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/systemone/batch`;
  const body = JSON.stringify({ states, questions: { [QUESTION_KEY]: question }, model: LAYA_MODEL });
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
    const json = (await res.json()) as { results?: { answers?: Record<string, LayaAnswer> }[] };
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
}
