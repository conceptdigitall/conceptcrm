import { createClient } from '@supabase/supabase-js';
import type { LeadColumn, LeadSearch, MarketingVideo } from '@/types';
import { internalAccountIds } from '@/lib/internal-accounts';
import { claimNext, requeueOrphaned } from './queue';
import { runProspectingJob } from './prospecting';
import { runVideoJob } from './video';
import { requeueColumnsForAccount, runColumnJob } from './columns';
import { layaBatch } from './laya-client';
import { arbitrateWithClaude } from '@/lib/laya/claude-arbitrator';

const POLL_MS = 5000;

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
      await runColumnJob(db, column, {
        laya: (states, question) => layaBatch(layaUrl, states, question),
        arbitrateWithClaude,
      });
      return true;
    }
  }
  const video = await claimNext<MarketingVideo>(db, 'marketing_videos', accountIds);
  if (video) {
    console.log(`[marketing] ${video.prompt.slice(0, 60)}`);
    await runVideoJob(db, video);
    return true;
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
