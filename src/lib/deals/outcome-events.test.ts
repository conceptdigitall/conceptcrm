import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/webhooks/deliver', () => ({
  dispatchWebhookEvent: vi.fn(async () => undefined),
}));

import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';
import { DealOutcomeError, dispatchDealOutcome } from './outcome-events';

function makeDb(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const admin = {} as SupabaseClient;
const base = {
  id: 'd1',
  title: 'Clínica X',
  value: 1500,
  contact_id: 'c1',
  pipeline_id: 'p1',
  stage_id: 's1',
  updated_at: '2026-10-01T03:00:00Z',
};

describe('dispatchDealOutcome', () => {
  beforeEach(() => vi.mocked(dispatchWebhookEvent).mockClear());

  it('dispatches deal.won for a won deal', async () => {
    const db = makeDb({ data: { ...base, status: 'won' }, error: null });
    const outcome = await dispatchDealOutcome({ db, admin, accountId: 'a1', dealId: 'd1' });
    expect(outcome).toBe('won');
    expect(dispatchWebhookEvent).toHaveBeenCalledWith(
      admin,
      'a1',
      'deal.won',
      expect.objectContaining({ deal_id: 'd1', outcome: 'won', value: 1500 })
    );
  });

  it('dispatches deal.lost for a lost deal', async () => {
    const db = makeDb({ data: { ...base, status: 'lost' }, error: null });
    await dispatchDealOutcome({ db, admin, accountId: 'a1', dealId: 'd1' });
    expect(dispatchWebhookEvent).toHaveBeenCalledWith(admin, 'a1', 'deal.lost', expect.anything());
  });

  it('rejects an open deal with 409 and dispatches nothing', async () => {
    const db = makeDb({ data: { ...base, status: 'open' }, error: null });
    await expect(
      dispatchDealOutcome({ db, admin, accountId: 'a1', dealId: 'd1' })
    ).rejects.toMatchObject({ status: 409 });
    expect(dispatchWebhookEvent).not.toHaveBeenCalled();
  });

  it('returns 404 when the deal is not visible under RLS', async () => {
    const db = makeDb({ data: null, error: null });
    await expect(
      dispatchDealOutcome({ db, admin, accountId: 'a1', dealId: 'd1' })
    ).rejects.toBeInstanceOf(DealOutcomeError);
    expect(dispatchWebhookEvent).not.toHaveBeenCalled();
  });
});
