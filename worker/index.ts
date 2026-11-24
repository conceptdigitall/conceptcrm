import { createClient } from '@supabase/supabase-js';
import type { LeadColumn, LeadSearch, MarketingVideo } from '@/types';
import { internalAccountIds } from '@/lib/internal-accounts';
import { claimNext, requeueOrphaned } from './queue';
import { runProspectingJob } from './prospecting';
import { ENGINE, MODEL, generateText, runVideoJob } from './video';
import { runAutopilotTick, syncPostsForVideo } from './autopilot';
import { generateTextHaiku, runPautaTick } from './pauta';
import { autopilotConfigFromEnv } from '@/lib/marketing/autopilot';
import { requeueColumnsForAccount, runColumnJob } from './columns';
import { layaBatch, layaEmbed } from './laya-client';
import { headPredictor, learnAfterRun } from './learning';
import { runReferenceTick } from './references';
import { makeReferenceDeps } from './reference-deps';
import { arbitrateWithClaude } from '@/lib/laya/claude-arbitrator';
import { ownedTables, workerTasksFromEnv } from './tasks';

const POLL_MS = 5000;
// O piloto só olha a agenda de tempos em tempos; a fila de vídeos segue no ritmo normal.
const AUTOPILOT_EVERY_MS = 15 * 60 * 1000;
// A pauta semanal confere com mais frequência: o João espera a produção após aprovar no celular.
const PAUTA_EVERY_MS = 2 * 60 * 1000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} no .env.local (ou nas variáveis do servidor)`);
  return v;
}

requireEnv('ANTHROPIC_API_KEY');
const accountIds = internalAccountIds();
if (accountIds.length === 0) {
  throw new Error('Falta NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS no .env.local (contas que o worker atende)');
}
const tasks = workerTasksFromEnv(process.env.WORKER_TASKS);
const layaUrl = tasks.has('planilha') ? process.env.LAYA_URL : undefined;
if (tasks.has('planilha') && !layaUrl) {
  console.warn('LAYA_URL não definida: colunas da Planilha Preditiva ficam na fila (veja docs/worker.md)');
}

const referencesEnabled = tasks.has('referencias') && Boolean(process.env.GEMINI_API_KEY);
if (tasks.has('referencias') && !referencesEnabled) {
  console.warn('GEMINI_API_KEY não definida: referências virais ficam na fila (veja docs/worker.md)');
}

const autopilot = tasks.has('piloto') ? autopilotConfigFromEnv(process.env) : null;
if (autopilot) {
  console.log(`Piloto automático ligado: ${autopilot.feedPerWeek} posts e ${autopilot.storiesPerWeek} stories por semana (sempre com aprovação).`);
}
let lastAutopilotAt = 0;
let lastPautaAt = 0;

const db = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const referenceDeps = makeReferenceDeps(db);

let stopping = false;
// SIGTERM vem do Railway/Docker no redeploy. Um render no meio é cortado e volta
// para a fila quando o próximo worker iniciar (requeueOrphaned).
const stop = () => { stopping = true; console.log('\nParando depois do job atual…'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Order: searches, then columns (fast, João is watching), then videos.
async function tick(): Promise<boolean> {
  const search = tasks.has('prospeccao') ? await claimNext<LeadSearch>(db, 'lead_searches', accountIds) : null;
  if (search) {
    console.log(`[prospecção] ${search.query} em ${search.location}`);
    await runProspectingJob(db, search);
    await requeueColumnsForAccount(db, search.account_id);
    return true;
  }
  if (layaUrl) {
    const column = await claimNext<LeadColumn>(db, 'lead_columns', accountIds);
    if (column) {
      console.log(`[planilha] ${column.title}`);
      const embed = (texts: string[]) => layaEmbed(layaUrl, texts);
      const done = await runColumnJob(db, column, {
        laya: (states, question) => layaBatch(layaUrl, states, question),
        arbitrateWithClaude,
        head: await headPredictor(db, column, embed),
      });
      if (done) await learnAfterRun(db, column.id, { embed, arbitrate: arbitrateWithClaude });
      return true;
    }
  }
  const video = tasks.has('video') ? await claimNext<MarketingVideo>(db, 'marketing_videos', accountIds) : null;
  if (video) {
    console.log(`[marketing] ${video.prompt.slice(0, 60)}`);
    await runVideoJob(db, video);
    await syncPostsForVideo(db, video.id);
    return true;
  }
  if (referencesEnabled && await runReferenceTick(db, accountIds, referenceDeps)) {
    console.log('[referências] análise processada');
    return true;
  }
  if (tasks.has('pauta') && Date.now() - lastPautaAt > PAUTA_EVERY_MS) {
    const worked = await runPautaTick(db, accountIds, {
      now: () => new Date(),
      generateText: (system, content) => generateText(system, content, 8000),
    });
    // Fez algo: olha de novo logo (pode haver outro item); senão espera o intervalo.
    if (!worked) lastPautaAt = Date.now();
    return worked;
  }
  if (autopilot && Date.now() - lastAutopilotAt > AUTOPILOT_EVERY_MS) {
    const created = await runAutopilotTick(db, accountIds, autopilot, {
      now: () => new Date(),
      generateText: (system, content) => generateText(system, content),
    });
    // Criou um item: olha de novo logo (pode haver outro atrasado); senão espera o intervalo.
    if (!created) lastAutopilotAt = Date.now();
    return created;
  }
  return false;
}

async function main() {
  // Só as filas deste worker: com Mac e Railway divididos, um não devolve o job que o outro está fazendo.
  let requeued = 0;
  for (const table of ownedTables(tasks)) requeued += await requeueOrphaned(db, table);
  if (requeued > 0) console.log(`Devolvidos à fila: ${requeued} job(s) travados`);
  console.log(`Tarefas: ${[...tasks].join(', ')}`);
  if (tasks.has('video')) console.log(`Vídeo: motor ${ENGINE}, modelo ${MODEL}`);
  console.log('Worker rodando. Ctrl+C para parar.');
  while (!stopping) {
    try {
      const worked = await tick();
      if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (err) {
      console.error('[worker] erro no ciclo:', err);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

void main();
