// Compara o que o Laya respondeu numa coluna com o que a Claude responde para os mesmos leads.
// Uso: node --env-file=.env.local --import tsx worker/scripts/compare-column.ts <column-id> [n=50]
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  allowedValues, buildLeadState, canonicalValue, displayedCell, parseColumnTitle,
} from '@/lib/prospecting/columns';
import type { Lead, LeadColumnValue } from '@/types';

const MODEL = 'claude-sonnet-5-5';

async function main() {
  const [columnId, nArg] = process.argv.slice(2);
  if (!columnId) throw new Error('Uso: compare-column.ts <column-id> [n=50]');
  const n = Number(nArg ?? 50);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const anthropic = new Anthropic();

  const { data: column } = await db.from('lead_columns').select('*').eq('id', columnId).single();
  if (!column) throw new Error('Coluna não encontrada');
  const parsed = parseColumnTitle(column.title);
  if (!parsed.ok) throw new Error(parsed.error);
  const { kind, options } = parsed.value;
  const allowed = allowedValues(kind, options);

  const { data: values } = await db.from('lead_column_values').select('*').eq('column_id', columnId).limit(n);
  let agree = 0;
  let total = 0;
  for (const v of (values ?? []) as LeadColumnValue[]) {
    const laya = displayedCell({ ...v, corrected_value: null })?.value;
    if (!laya) continue;
    const { data: lead } = await db.from('leads').select('*').eq('id', v.lead_id).single();
    if (!lead) continue;
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: `${buildLeadState(lead as Lead)}\n\nPergunta: ${column.title}\n`
          + `Responda só com uma destas opções, sem mais nada: ${allowed.join(' | ')}`,
      }],
    });
    const reply = msg.content.find((b) => b.type === 'text')?.text ?? '';
    const claude = canonicalValue(kind, options, reply.trim().replace(/[.!]$/, ''));
    total += 1;
    if (claude === laya) agree += 1;
    console.log(`${claude === laya ? '✓' : '✗'} laya=${laya} claude=${claude ?? reply.trim()} | ${(lead as Lead).name}`);
  }
  const pct = total ? Math.round((agree / total) * 100) : 0;
  console.log(`\n"${column.title}": ${agree}/${total} iguais (${pct}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
