// Banco de ganchos: o diretor gera 10 ganchos tipados, o código descarta os que quebram as regras
// duras (frase proibida, prova sem número real) e um jurado mais barato escolhe o melhor.
// Spec: docs/superpowers/specs/2026-11-02-video-cenario-ganchos.md

export const HOOK_KINDS = ['curiosidade', 'dor', 'prova', 'conflito'] as const;
export type HookKind = (typeof HOOK_KINDS)[number];

export const PAYOFF_BEATS = ['dor', 'virada', 'depois', 'cta'] as const;
export type PayoffBeat = (typeof PAYOFF_BEATS)[number];

/** Quantos ganchos de cada tipo o diretor precisa devolver. */
export const HOOK_QUOTA: Record<HookKind, number> = { curiosidade: 3, dor: 3, prova: 3, conflito: 1 };
export const MAX_HOOK_WORDS = 12;

export interface Hook {
  kind: HookKind;
  /** O que se move na tela em 0,0 s. */
  firstFrame: string;
  /** Fala (e texto grande) de abertura, até 12 palavras. */
  line: string;
  /** Promessa implícita que o espectador espera ver cumprida. */
  promise: string;
  /** Batida da história em que a promessa é cumprida. */
  payoffBeat: PayoffBeat;
  /** Só na prova: trecho literal do briefing que contém o número usado. */
  evidence?: string;
}

export interface BankedHook extends Hook {
  /** Motivo do descarte pelas regras duras; ausente se o gancho concorre. */
  discarded?: string;
}

export interface HookBank {
  hooks: BankedHook[];
  chosenIndex: number;
  reason: string;
  /** true quando o jurado falhou e valeu o primeiro gancho elegível. */
  judgeFallback?: boolean;
}

export class HookBankError extends Error {
  constructor(detail: string) {
    super(`Banco de ganchos falhou: ${detail}`);
    this.name = 'HookBankError';
  }
}

// ---------- parse e validação ----------

type Parsed = { ok: true; hooks: BankedHook[] } | { ok: false; errors: string[] };

function extractJson(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
  const raw = fenced ?? reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const BANNED_OPENINGS: [RegExp, string][] = [
  [/voc[êe] n[ãa]o vai acreditar/i, '"você não vai acreditar"'],
  [/\boi,?\s+gente\b/i, '"oi gente"'],
  [/\bol[áa],?\s+pessoal\b/i, '"olá pessoal"'],
  [/\bneste v[íi]deo\b/i, '"neste vídeo"'],
  [/\bvoc[êe] sabia\b/i, '"você sabia"'],
  [/\blogo(tipo|marca)\b|\bnosso logo\b|\blogo d[aoe]\b/i, 'logo'],
  [/\bintrodu[çc][ãa]o\b|\bintro\b|\bvinheta\b/i, 'introdução'],
];

/** Frase proibida na abertura (fala ou primeiro quadro), ou null. */
export function bannedOpening(hook: Pick<Hook, 'line' | 'firstFrame'>): string | null {
  for (const [re, label] of BANNED_OPENINGS) {
    if (re.test(hook.line) || re.test(hook.firstFrame)) return label;
  }
  return null;
}

/** "1.200" → "1200", "1,5" → "1.5": mesma grafia para comparar números de texto livre. */
function normalizeNumber(token: string): string {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(token)) return token.replace(/\./g, '').replace(',', '.');
  return token.replace(',', '.');
}

export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map(normalizeNumber);
}

const collapse = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Prova só vale com número que está no briefing, citado literalmente em `evidence`. */
export function proofProblem(hook: Hook, briefing: string): string | null {
  const used = numbersIn(hook.line);
  if (!used.length) return 'prova sem número na fala';
  const real = new Set(numbersIn(briefing));
  const invented = used.filter((n) => !real.has(n));
  if (invented.length) return `prova com número que não está no briefing (${invented.join(', ')})`;
  const evidence = collapse(hook.evidence ?? '');
  if (!evidence) return 'prova sem trecho do briefing como evidência';
  if (!collapse(briefing).includes(evidence)) return 'a evidência da prova não aparece no briefing';
  return null;
}

/** Valida a estrutura (erro → o diretor tenta de novo) e marca os descartes por regra dura. */
export function parseHooks(reply: string, briefing: string): Parsed {
  let parsed: unknown;
  try {
    parsed = extractJson(reply);
  } catch {
    return { ok: false, errors: ['a resposta não é um JSON válido'] };
  }
  const list = (parsed as { hooks?: unknown } | null)?.hooks;
  if (!Array.isArray(list)) return { ok: false, errors: ['falta a lista "hooks"'] };

  const errors: string[] = [];
  const hooks: BankedHook[] = [];
  list.forEach((raw, i) => {
    const n = i + 1;
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    if (!o) { errors.push(`gancho ${n}: precisa ser um objeto`); return; }
    const text = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
    const kind = o.kind as HookKind;
    if (!HOOK_KINDS.includes(kind)) { errors.push(`gancho ${n}: kind deve ser ${HOOK_KINDS.join(', ')}`); return; }
    const beat = o.payoffBeat as PayoffBeat;
    if (!PAYOFF_BEATS.includes(beat)) errors.push(`gancho ${n}: payoffBeat deve ser ${PAYOFF_BEATS.join(', ')}`);
    for (const k of ['firstFrame', 'line', 'promise']) if (!text(k)) errors.push(`gancho ${n}: ${k} vazio`);
    const words = wordCount(text('line'));
    if (words > MAX_HOOK_WORDS) errors.push(`gancho ${n}: a fala tem ${words} palavras (máximo ${MAX_HOOK_WORDS})`);
    const hook: BankedHook = {
      kind, firstFrame: text('firstFrame'), line: text('line'), promise: text('promise'), payoffBeat: beat,
      ...(text('evidence') ? { evidence: text('evidence') } : {}),
    };
    const reason = bannedOpening(hook) ? `abertura proibida: ${bannedOpening(hook)}`
      : kind === 'prova' ? proofProblem(hook, briefing) : null;
    if (reason) hook.discarded = reason;
    hooks.push(hook);
  });
  if (errors.length) return { ok: false, errors };

  for (const kind of HOOK_KINDS) {
    const got = hooks.filter((h) => h.kind === kind).length;
    if (got !== HOOK_QUOTA[kind]) errors.push(`devolva ${HOOK_QUOTA[kind]} ganchos de ${kind} (vieram ${got})`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, hooks };
}

// ---------- prompts ----------

const FORMULA = '[movimento ou impacto visual] + [afirmação curta] + [promessa específica]';

export function generationSystem(): string {
  return [
    'Você é o diretor de vídeos curtos da Concept Digital e escreve ganchos para Reels em português do Brasil.',
    `Fórmula: ${FORMULA}.`,
    '',
    'Gere EXATAMENTE 10 ganchos: 3 de curiosidade, 3 de dor, 3 de prova e 1 de conflito.',
    '- curiosidade: imagem ou afirmação que abre uma pergunta que a história responde.',
    '- dor: a cena concreta do dia a dia do dono do negócio (horário, objeto, situação), nunca frase que serve para qualquer negócio.',
    '- prova: a fala usa um número que está no briefing. Em "evidence" copie, LITERALMENTE, o trecho do briefing que contém esse número. Se o briefing não traz nenhum número, devolva os 3 de prova com "evidence" vazio (serão descartados).',
    '- conflito: contraste direto entre o jeito errado e o certo.',
    '',
    'Cada gancho traz:',
    '- kind: "curiosidade" | "dor" | "prova" | "conflito"',
    '- firstFrame: o que se MOVE na tela em 0,0 s (objeto, texto batendo, corte). Nada estático, sem logo e sem introdução.',
    `- line: a fala de abertura, até ${MAX_HOOK_WORDS} palavras, que também vira o texto grande do primeiro quadro.`,
    '- promise: a promessa implícita que o espectador espera ver cumprida.',
    `- payoffBeat: em que batida a promessa é cumprida: ${PAYOFF_BEATS.map((b) => `"${b}"`).join(' | ')}. A história do vídeo precisa mesmo cumpri-la.`,
    '- evidence: só nos ganchos de prova.',
    '',
    'Proibido na abertura: "você não vai acreditar", "oi gente", "olá pessoal", "neste vídeo", "você sabia", logo e introdução.',
    'Não invente número, preço, nome, prazo, promoção ou resultado. Fato que não está no briefing não entra.',
    '',
    'Responda com UM bloco ```json: { "hooks": [ { "kind", "firstFrame", "line", "promise", "payoffBeat", "evidence" } ] }',
  ].join('\n');
}

export function generationUser(briefing: string, errors: string[] = []): string {
  return [
    `Briefing do vídeo: ${briefing || '(sem briefing: use só situações genéricas do nicho, sem números)'}`,
    ...(errors.length ? ['', 'Sua resposta anterior foi recusada:', ...errors.map((e) => `- ${e}`), 'Responda de novo com UM bloco ```json corrigido.'] : []),
  ].join('\n');
}

export function judgeSystem(): string {
  return [
    'Você é o jurado de ganchos de Reels da Concept Digital. Escolha UM gancho da lista.',
    'Critérios, em ordem de peso:',
    '1. Movimento no quadro zero (firstFrame) e texto grande legível em tela de celular.',
    '2. A fala para o scroll nos primeiros 2 segundos e é específica do nicho do briefing, não serve para qualquer negócio.',
    '3. A promessa é cumprida na própria história, na batida indicada em payoffBeat.',
    '4. Sem tom de infoproduto, sem exagero, sem promessa de resultado.',
    'Todos os ganchos da lista já passaram nas regras de frase proibida e de número real; não precisa checar isso.',
    'Responda só com UM bloco ```json: { "choice": <número do gancho na lista>, "reason": "<uma frase>" }',
  ].join('\n');
}

export function judgeUser(briefing: string, eligible: { index: number; hook: Hook }[]): string {
  return [
    `Briefing: ${briefing || '(sem briefing)'}`,
    '',
    ...eligible.map(({ index, hook }) => [
      `Gancho ${index}`,
      `- tipo: ${hook.kind}`,
      `- primeiro quadro: ${hook.firstFrame}`,
      `- fala: ${hook.line}`,
      `- promessa: ${hook.promise}`,
      `- cumprida na batida: ${hook.payoffBeat}`,
    ].join('\n')),
  ].join('\n');
}

/** Escolha do jurado; null se a resposta não aponta para um gancho elegível. */
export function parseJudge(reply: string, eligible: number[]): { choice: number; reason: string } | null {
  try {
    const o = extractJson(reply) as { choice?: unknown; reason?: unknown };
    const choice = Number(o.choice);
    if (!Number.isInteger(choice) || !eligible.includes(choice)) return null;
    return { choice, reason: typeof o.reason === 'string' ? o.reason.trim() : '' };
  } catch {
    return null;
  }
}

// ---------- fluxo ----------

export interface HookDeps {
  /** director = modelo forte (gera os 10); judge = modelo mais barato (escolhe). */
  ask(role: 'director' | 'judge', system: string, user: string): Promise<string>;
}

const MAX_ATTEMPTS = 2;

export async function runHookBank(deps: HookDeps, briefing: string): Promise<HookBank> {
  let hooks: BankedHook[] | null = null;
  let errors: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !hooks; attempt++) {
    const result = parseHooks(await deps.ask('director', generationSystem(), generationUser(briefing, errors)), briefing);
    if (result.ok) hooks = result.hooks; else errors = result.errors;
  }
  if (!hooks) throw new HookBankError(errors.join('; '));

  const eligible = hooks.flatMap((hook, index) => (hook.discarded ? [] : [{ index, hook }]));
  if (!eligible.length) throw new HookBankError('todos os ganchos foram descartados pelas regras');

  let verdict: { choice: number; reason: string } | null = null;
  try {
    verdict = parseJudge(
      await deps.ask('judge', judgeSystem(), judgeUser(briefing, eligible)),
      eligible.map((e) => e.index),
    );
  } catch {
    verdict = null;
  }
  return verdict
    ? { hooks, chosenIndex: verdict.choice, reason: verdict.reason }
    : { hooks, chosenIndex: eligible[0].index, reason: 'O jurado não respondeu; vale o primeiro gancho elegível.', judgeFallback: true };
}

/** Linhas do pedido de composição com o gancho escolhido. */
export function hookPromptLines(bank: HookBank): string[] {
  const h = bank.hooks[bank.chosenIndex];
  return [
    'GANCHO ESCOLHIDO (obrigatório; a abertura do vídeo é esta):',
    `- Em 0,0 s se move: ${h.firstFrame}`,
    `- Texto grande e fala de abertura: "${h.line}"`,
    `- Promessa implícita: ${h.promise}`,
    `- A história precisa cumprir essa promessa na batida "${h.payoffBeat}".`,
  ];
}
