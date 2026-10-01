import type { SupabaseClient } from '@supabase/supabase-js';

import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';

export type DealOutcome = 'won' | 'lost';

export class DealOutcomeError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

interface DealRow {
  id: string;
  title: string | null;
  value: number | null;
  status: string;
  contact_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  updated_at: string | null;
}

/**
 * Announce a deal outcome to outbound webhook endpoints. The status is
 * re-read from the DB under the caller's RLS scope, so the event only
 * fires for a deal that really is won/lost in this account.
 */
export async function dispatchDealOutcome(input: {
  db: SupabaseClient;
  admin: SupabaseClient;
  accountId: string;
  dealId: string;
}): Promise<DealOutcome> {
  const { data, error } = await input.db
    .from('deals')
    .select('id, title, value, status, contact_id, pipeline_id, stage_id, updated_at')
    .eq('id', input.dealId)
    .maybeSingle();

  if (error) throw new DealOutcomeError('Failed to load deal', 500);
  if (!data) throw new DealOutcomeError('Deal not found', 404);

  const deal = data as DealRow;
  if (deal.status !== 'won' && deal.status !== 'lost') {
    throw new DealOutcomeError('Deal is not won or lost', 409);
  }

  await dispatchWebhookEvent(input.admin, input.accountId, `deal.${deal.status}`, {
    deal_id: deal.id,
    title: deal.title,
    value: deal.value,
    outcome: deal.status,
    contact_id: deal.contact_id,
    pipeline_id: deal.pipeline_id,
    stage_id: deal.stage_id,
    closed_at: deal.updated_at,
  });

  return deal.status;
}
