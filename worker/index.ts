import { createClient } from '@supabase/supabase-js';
import type { LeadColumn, LeadSearch, MarketingVideo } from '@/types';
import { internalAccountIds } from '@/lib/internal-accounts';
import { claimNext, requeueOrphaned } from './queue';
import { runProspectingJob } from './prospecting';
import { generateText, runVideoJob } from './video';
import { runAutopilotTick, syncPostsForVideo } from './autopilot';
import { autopilotConfigFromEnv } from '@/lib/marketing/autopilot';
import { requeueColumnsForAccount, runColumnJob } from './columns';
import { layaBatch, layaEmbed } from './laya-client';
import { headPredictor, learnAfterRun } from './learning';
import { arbitrateWithClaude } from '@/lib/laya/claude-arbitrator';

const POLL_MS = 5000;
// O piloto só olha a agenda de tempos em tempos; a fila de vídeos segue no ritmo normal.
const AUTOPILOT_EVERY_MS = 15 * 60 * 1000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} no .env.local`);
  return v;
}

requireEnv('ANTHROPIC_API_KEY');
const accountIds = internalAccountIds();
if (accountIds.length === 0) {
  throw new Error('Falta NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS no .env.local (contas que o worker atende)');
}
const layaUrl = process.env.LAYA_URL;
if (!layaUrl) {
  console.warn('LAYA_URL não definida: colunas da Planilha Preditiva ficam na fila (veja docs/worker.md)');
}

const autopilot = autopilotConfigFromEnv(process.env);
if (autopilot) {
  console.log(`Piloto automático ligado: ${autopilot.feedPerWeek} posts e ${autopilot.storiesPerWeek} stories por semana (sempre com aprovação).`);
}
let lastAutopilotAt = 0;

const db = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('\nParando depois do job atual…'); });

// Order: searches, then columns (fast, João is watching), then videos.
async function tick(): Promise<boolean> {
  const search = await claimNext<LeadSearch>(db, 'lead_searches', accountIds);
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
  const video = await claimNext<MarketingVideo>(db, 'marketing_videos', accountIds);
  if (video) {
    console.log(`[marketing] ${video.prompt.slice(0, 60)}`);
    await runVideoJob(db, video);
    await syncPostsForVideo(db, video.id);
    return true;
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
  const a = await requeueOrphaned(db, 'lead_searches');
  const b = await requeueOrphaned(db, 'marketing_videos');
  const c = await requeueOrphaned(db, 'lead_columns');
  if (a + b + c > 0) console.log(`Devolvidos à fila: ${a + b + c} job(s) travados`);
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
