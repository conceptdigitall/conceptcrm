// Análise de referências virais: pega a próxima referência pendente, baixa o
// vídeo (link ou upload), pede ao Gemini a análise estruturada e grava o
// resultado. A pauta semanal usa essas análises como inspiração.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REFERENCE_MAX_SECONDS,
  parseReferenceAnalysis,
  referenceAnalysisPrompt,
} from '@/lib/marketing/references';
import type { MarketingReference } from '@/types';
import { failJob, finishJob } from './queue';

export interface ReferenceDeps {
  now(): Date;
  probeDuration(url: string): Promise<number>;
  probeFileDuration(path: string): Promise<number>;
  download(url: string, dir: string): Promise<string>;
  downloadUpload(path: string, dir: string): Promise<string>;
  removeUpload(path: string): Promise<void>;
  analyze(videoPath: string, prompt: string): Promise<string>;
}

export class GeminiQuotaError extends Error {}

const RETRY_AFTER_MS = 60 * 60_000;
const DEFAULT_BUSINESS_NAME = 'Concept Digital';

const MSG_TOO_LONG = 'vídeo longo demais';
const MSG_NEED_FILE = 'envie o arquivo do vídeo';
const MSG_ANALYSIS = 'análise falhou';
const MSG_GENERIC = 'erro inesperado ao analisar';

class JobFailure extends Error {}

export async function claimNextReference(
  db: SupabaseClient, accountIds: string[], now: Date,
): Promise<MarketingReference | null> {
  const { data: candidates } = await db
    .from('marketing_references').select('id')
    .eq('status', 'pending').in('account_id', accountIds)
    .or(`retry_after.is.null,retry_after.lte.${now.toISOString()}`)
    .order('created_at', { ascending: true }).limit(1);
  const next = candidates?.[0];
  if (!next) return null;
  const { data: claimed } = await db
    .from('marketing_references')
    .update({ status: 'running', started_at: now.toISOString(), error: null })
    .eq('id', next.id)
    .eq('status', 'pending')
    .select();
  return (claimed?.[0] as MarketingReference | undefined) ?? null;
}

async function businessName(db: SupabaseClient, accountId: string): Promise<string> {
  const { data } = await db
    .from('marketing_settings').select('business_name').eq('account_id', accountId).maybeSingle();
  const name = (data as { business_name?: string | null } | null)?.business_name;
  return name?.trim() || DEFAULT_BUSINESS_NAME;
}

async function prepareVideo(ref: MarketingReference, dir: string, deps: ReferenceDeps): Promise<string> {
  if (ref.arquivo_path) {
    const local = await deps.downloadUpload(ref.arquivo_path, dir);
    if ((await deps.probeFileDuration(local)) > REFERENCE_MAX_SECONDS) throw new JobFailure(MSG_TOO_LONG);
    return local;
  }
  // Se o probe falhar (link privado, plataforma bloqueada), o João precisa enviar o arquivo.
  let seconds: number;
  try { seconds = await deps.probeDuration(ref.url); } catch { throw new JobFailure(MSG_NEED_FILE); }
  if (seconds > REFERENCE_MAX_SECONDS) throw new JobFailure(MSG_TOO_LONG);
  try { return await deps.download(ref.url, dir); } catch { throw new JobFailure(MSG_NEED_FILE); }
}

export async function runReferenceTick(
  db: SupabaseClient, accountIds: string[], deps: ReferenceDeps,
): Promise<boolean> {
  const ref = await claimNextReference(db, accountIds, deps.now());
  if (!ref) return false;

  const uploadPath = ref.arquivo_path;
  let dir: string | null = null;
  let requeued = false;
  try {
    dir = await mkdtemp(join(tmpdir(), 'reference-'));
    const video = await prepareVideo(ref, dir, deps);
    const prompt = referenceAnalysisPrompt({
      eixo: ref.eixo, nicho: ref.nicho, businessName: await businessName(db, ref.account_id),
    });
    // Até 2 tentativas: o Gemini às vezes devolve JSON fora do formato.
    let analise = null;
    for (let attempt = 0; attempt < 2 && !analise; attempt++) {
      analise = parseReferenceAnalysis(await deps.analyze(video, prompt));
    }
    if (!analise) throw new JobFailure(MSG_ANALYSIS);
    await finishJob(db, 'marketing_references', ref.id, { analise, ...(ref.arquivo_path ? { arquivo_path: null } : {}) });
  } catch (err) {
    if (err instanceof GeminiQuotaError) {
      // Não é culpa do vídeo: tenta de novo mais tarde, sem gastar o upload.
      await db.from('marketing_references')
        .update({
          status: 'pending', started_at: null,
          retry_after: new Date(deps.now().getTime() + RETRY_AFTER_MS).toISOString(),
        })
        .eq('id', ref.id);
      requeued = true;
      return true;
    }
    const message = err instanceof JobFailure ? err.message : MSG_GENERIC;
    await failJob(db, 'marketing_references', ref.id, message, ref.arquivo_path ? { arquivo_path: null } : {});
    if (!(err instanceof JobFailure)) console.error('[references] falha inesperada', ref.id, err);
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
    // Upload só some quando o trabalho terminou (done/failed); na espera de cota ele fica.
    if (uploadPath && !requeued) await deps.removeUpload(uploadPath).catch(() => {});
  }
  return true;
}
