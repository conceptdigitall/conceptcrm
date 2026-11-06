// Referências: vídeos virais enviados por link/arquivo e analisados pelo Gemini.
// Só regra pura (URL, validação, prompt, parse); download e IA ficam no worker.
import type {
  BusinessNiche,
  ReferenceAnalysis,
  ReferenceEixo,
  ReferenceFormato,
  ReferenceHookKind,
  ReferencePlatform,
} from '@/types';
import { BUSINESS_NICHES } from './niche-autopilot';
import { parseObject, txt } from './json-text';

export type { ReferenceAnalysis } from '@/types';

export const REFERENCE_MAX_SECONDS = 180;
/** Erro gravado quando o vídeo passa do limite; repetir a análise não adianta. */
export const REFERENCE_ERROR_TOO_LONG = 'vídeo longo demais';
export const REFERENCE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com'];
const TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'];
const TIKTOK_SHORT_HOSTS = ['vm.tiktok.com', 'vt.tiktok.com'];

const EIXOS: ReferenceEixo[] = ['como_falar', 'sobre_o_que'];
const HOOK_KINDS: ReferenceHookKind[] = ['curiosidade', 'dor', 'prova', 'conflito'];
const FORMATOS: ReferenceFormato[] = ['pessoa_falando', 'tela', 'texto_animado', 'bastidor', 'misto'];

/** Link público de Instagram/TikTok em forma canônica; null se não for aceito. */
export function normalizeReferenceUrl(raw: string): { url: string; normalized: string; platform: ReferencePlatform } | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/+$/, '');

  if (INSTAGRAM_HOSTS.includes(host)) {
    const m = path.match(/^\/(reels?|p)\/([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    const kind = m[1] === 'p' ? 'p' : 'reel';
    return { url, normalized: `https://www.instagram.com/${kind}/${m[2]}`, platform: 'instagram' };
  }
  if (TIKTOK_HOSTS.includes(host)) {
    const m = path.match(/^\/(@[A-Za-z0-9._-]+)\/video\/(\d+)$/);
    if (!m) return null;
    return { url, normalized: `https://www.tiktok.com/${m[1]}/video/${m[2]}`, platform: 'tiktok' };
  }
  if (TIKTOK_SHORT_HOSTS.includes(host)) {
    const m = path.match(/^\/([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    return { url, normalized: `https://${host}/${m[1]}`, platform: 'tiktok' };
  }
  return null;
}

type Fail = { ok: false; error: string };
type Meta = { eixo: ReferenceEixo; nicho: BusinessNiche | null; views: number | null };

/** Eixo, nicho e views (comuns a link e upload). */
export function validateReferenceMeta(body: unknown): { ok: true; value: Meta } | Fail {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Dados inválidos.' };
  const b = body as Record<string, unknown>;
  if (!EIXOS.includes(b.eixo as ReferenceEixo)) return { ok: false, error: 'Escolha o eixo da referência.' };
  const eixo = b.eixo as ReferenceEixo;

  let nicho: BusinessNiche | null = null;
  if (eixo === 'sobre_o_que') {
    const n = BUSINESS_NICHES.find((p) => p.value === b.nicho);
    if (!n) return { ok: false, error: 'Escolha o nicho.' };
    nicho = n.value;
  }

  let views: number | null = null;
  if (b.views !== undefined && b.views !== null && b.views !== '') {
    if (typeof b.views !== 'number' || !Number.isInteger(b.views) || b.views < 0) {
      return { ok: false, error: 'Views deve ser um número inteiro, zero ou maior.' };
    }
    views = b.views;
  }
  return { ok: true, value: { eixo, nicho, views } };
}

export function validateReferenceInput(
  body: unknown,
): { ok: true; value: { url: string; normalized: string; platform: ReferencePlatform } & Meta } | Fail {
  const meta = validateReferenceMeta(body);
  if (!meta.ok) return meta;
  const link = normalizeReferenceUrl((body as Record<string, unknown>).url as string);
  if (!link) return { ok: false, error: 'Use um link de Reel/post do Instagram ou vídeo do TikTok.' };
  return { ok: true, value: { ...link, ...meta.value } };
}

export function referenceAnalysisPrompt(input: { eixo: ReferenceEixo; nicho: BusinessNiche | null; businessName: string }): string {
  const foco = input.eixo === 'como_falar'
    ? 'O foco é COMO o vídeo fala: gancho, ritmo, cortes e formato.'
    : `O foco é SOBRE O QUE o vídeo fala: o tema${input.nicho ? ` no nicho "${input.nicho}"` : ''}.`;
  return [
    `Analise este vídeo viral para ${input.businessName}, que vai adaptar o que funcionou para o próprio Instagram.`,
    foco,
    '',
    'Responda só com um objeto JSON com exatamente estas chaves:',
    `- "gancho": objeto {"tipo": ${HOOK_KINDS.map((k) => `"${k}"`).join(', ')} (um deles), "frase": primeira frase falada ou escrita, "primeiroQuadro": o que aparece no primeiro quadro}.`,
    '- "duracaoSeg": duração em segundos (número).',
    '- "cortesPorMinuto": quantidade de cortes por minuto (número).',
    `- "formato": ${FORMATOS.map((k) => `"${k}"`).join(', ')} (um deles).`,
    '- "tema": tema do vídeo (até 80 caracteres).',
    '- "promessa": o que o vídeo promete ao espectador (até 140).',
    '- "entrega": o que ele realmente entrega (até 140).',
    '- "cta": chamada para ação, se houver (até 100).',
    '- "porQueViralizou": lista com exatamente 3 motivos (até 140 cada).',
    `- "comoAdaptar": como ${input.businessName} pode adaptar (até 280).`,
  ].join('\n');
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** Lê a análise do Gemini; null se faltar campo, tipo fechado inválido ou vierem menos de 3 motivos. */
export function parseReferenceAnalysis(raw: string): ReferenceAnalysis | null {
  const o = parseObject(raw);
  if (!o) return null;
  const g = o.gancho && typeof o.gancho === 'object' ? (o.gancho as Record<string, unknown>) : null;
  if (!g || !HOOK_KINDS.includes(g.tipo as ReferenceHookKind)) return null;
  if (!FORMATOS.includes(o.formato as ReferenceFormato)) return null;
  const duracaoSeg = num(o.duracaoSeg);
  const cortesPorMinuto = num(o.cortesPorMinuto);
  if (duracaoSeg === null || cortesPorMinuto === null) return null;
  if (!Array.isArray(o.porQueViralizou) || o.porQueViralizou.length < 3) return null;
  const porQueViralizou = o.porQueViralizou.slice(0, 3).map((m) => txt(m, 140));
  if (porQueViralizou.some((m) => !m)) return null;

  const frase = txt(g.frase, 200);
  const primeiroQuadro = txt(g.primeiroQuadro, 200);
  const tema = txt(o.tema, 80);
  const promessa = txt(o.promessa, 140);
  const entrega = txt(o.entrega, 140);
  const comoAdaptar = txt(o.comoAdaptar, 280);
  if (!frase || !primeiroQuadro || !tema || !promessa || !entrega || !comoAdaptar) return null;

  return {
    gancho: { tipo: g.tipo as ReferenceHookKind, frase, primeiroQuadro },
    duracaoSeg,
    cortesPorMinuto,
    formato: o.formato as ReferenceFormato,
    tema,
    promessa,
    entrega,
    cta: txt(o.cta, 100),
    porQueViralizou,
    comoAdaptar,
  };
}
