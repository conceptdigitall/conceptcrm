import { createClient } from '@supabase/supabase-js';
import type { LeadSearch, MarketingVideo } from '@/types';
import { claimNext, requeueStale } from './queue';
import { runProspectingJob } from './prospecting';
import { runVideoJob } from './video';

const POLL_MS = 5000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} no .env.local`);
  return v;
}

requireEnv('ANTHROPIC_API_KEY');

const db = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('\nParando depois do job atual…'); });

async function tick(): Promise<boolean> {
  const search = await claimNext<LeadSearch>(db, 'lead_searches');
  if (search) {
    console.log(`[prospecção] ${search.query} em ${search.location}`);
    await runProspectingJob(db, search);
    return true;
  }
  const video = await claimNext<MarketingVideo>(db, 'marketing_videos');
  if (video) {
    console.log(`[marketing] ${video.prompt.slice(0, 60)}`);
    await runVideoJob(db, video);
    return true;
  }
  return false;
}

async function main() {
  const a = await requeueStale(db, 'lead_searches');
  const b = await requeueStale(db, 'marketing_videos');
  if (a + b > 0) console.log(`Devolvidos à fila: ${a + b} job(s) travados`);
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
