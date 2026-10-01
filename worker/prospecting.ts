import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapPlaceToLead, parseScraperOutput } from '@/lib/prospecting/map-scraper';
import { validateSearchInput } from '@/lib/prospecting/validate';
import type { LeadSearch } from '@/types';
import { runCommand } from './exec';
import { failJob, finishJob } from './queue';

const SCRAPER_IMAGE = 'gosom/google-maps-scraper';
const SCRAPE_TIMEOUT_MS = 20 * 60 * 1000;

export function depthFor(maxResults: number): number {
  return Math.min(10, Math.max(1, Math.ceil(maxResults / 10)));
}

// Runs one query through the scraper container and returns its JSON output.
export async function scrapeWithDocker(queryLine: string, depth: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gmaps-'));
  try {
    await writeFile(join(dir, 'queries.txt'), `${queryLine}\n`);
    const { code, stderr } = await runCommand('docker', [
      'run', '--rm',
      '--platform', 'linux/amd64',
      '-v', `${dir}:/work`,
      SCRAPER_IMAGE,
      '-input', '/work/queries.txt',
      '-results', '/work/results.json',
      '-json', '-email', '-lang', 'pt',
      '-depth', String(depth),
      '-exit-on-inactivity', '2m',
    ], { timeoutMs: SCRAPE_TIMEOUT_MS });
    if (code !== 0) throw new Error(`Scraper saiu com código ${code}: ${stderr.slice(-800)}`);
    return await readFile(join(dir, 'results.json'), 'utf8').catch(() => '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runProspectingJob(
  db: SupabaseClient,
  search: LeadSearch,
  deps: { scrape?: (queryLine: string, depth: number) => Promise<string> } = {},
): Promise<void> {
  const scrape = deps.scrape ?? scrapeWithDocker;
  // RLS lets agents write rows directly, so re-check what the API would have.
  const valid = validateSearchInput({
    query: search.query, location: search.location, maxResults: search.max_results,
  });
  if (!valid.ok) {
    await failJob(db, 'lead_searches', search.id, valid.error);
    return;
  }
  try {
    const output = await scrape(`${search.query} em ${search.location}`, depthFor(search.max_results));
    const rows = parseScraperOutput(output)
      .slice(0, search.max_results)
      .map((p) => mapPlaceToLead(p, { accountId: search.account_id, searchId: search.id }));

    let inserted = 0;
    if (rows.length > 0) {
      const { data, error } = await db
        .from('leads')
        .upsert(rows, { onConflict: 'account_id,place_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(`Falha ao salvar leads: ${error.message}`);
      inserted = data?.length ?? 0;
    }
    await finishJob(db, 'lead_searches', search.id, { result_count: inserted });
  } catch (err) {
    await failJob(db, 'lead_searches', search.id, err instanceof Error ? err.message : String(err));
  }
}
