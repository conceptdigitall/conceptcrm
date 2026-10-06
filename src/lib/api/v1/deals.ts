// ============================================================
// Public API — deals and pipelines. Serialization plus the create /
// update cores for `/api/v1/deals` and `/api/v1/pipelines`.
//
// Tenancy: `deals` and `pipelines` carry account_id; `pipeline_stages`
// does not, so a stage is trusted only after checking that its
// pipeline belongs to the caller's account. All queries run on the
// service-role client, so every one is filtered by `accountId` here.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextResponse } from 'next/server';

import { fail } from '@/lib/api/v1/respond';
import { dispatchDealOutcome } from '@/lib/deals/outcome-events';

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_SELECT =
  'id, title, value, currency, status, notes, expected_close_date, pipeline_id, stage_id, contact_id, assigned_to, created_at, updated_at, stage:pipeline_stages(id, name), contact:contacts(id, name, phone)';

export class DealError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export function dealErrorResponse(err: DealError): NextResponse {
  if (err.status >= 500) return fail('internal', 'Failed to save deal', err.status);
  return fail(err.status === 404 ? 'not_found' : 'bad_request', err.message, err.status);
}

export interface ApiDeal {
  id: string;
  title: string;
  value: number;
  currency: string | null;
  status: string;
  notes: string | null;
  expected_close_date: string | null;
  pipeline_id: string;
  stage_id: string;
  stage_name: string | null;
  contact_id: string | null;
  contact: { id: string; name: string | null; phone: string } | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string | null;
}

export function serializeDeal(row: Record<string, unknown>): ApiDeal {
  const stage = row.stage as { id: string; name: string } | null;
  const contact = row.contact as { id: string; name: string | null; phone: string } | null;
  return {
    id: row.id as string,
    title: row.title as string,
    value: Number(row.value ?? 0),
    currency: (row.currency as string | null) ?? null,
    status: row.status as string,
    notes: (row.notes as string | null) ?? null,
    expected_close_date: (row.expected_close_date as string | null) ?? null,
    pipeline_id: row.pipeline_id as string,
    stage_id: row.stage_id as string,
    stage_name: stage?.name ?? null,
    contact_id: (row.contact_id as string | null) ?? null,
    contact: contact ? { id: contact.id, name: contact.name ?? null, phone: contact.phone } : null,
    assigned_to: (row.assigned_to as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export function isDealStatus(value: unknown): value is DealStatus {
  return typeof value === 'string' && (DEAL_STATUSES as readonly string[]).includes(value);
}

export interface ApiPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; position: number }[];
}

export async function listPipelines(db: SupabaseClient, accountId: string): Promise<ApiPipeline[]> {
  const { data, error } = await db
    .from('pipelines')
    .select('id, name, created_at, stages:pipeline_stages(id, name, position)')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[api/v1/pipelines] list error:', error);
    throw new DealError('Failed to list pipelines', 500);
  }
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    stages: ((p.stages as { id: string; name: string; position: number }[]) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, name: s.name, position: s.position })),
  }));
}

/**
 * Resolve (pipeline, stage) for a new deal. Both optional: no pipeline
 * means the account's oldest one; no stage means that pipeline's first
 * stage. Anything given must belong to the account.
 */
export async function resolvePipelineStage(
  db: SupabaseClient,
  accountId: string,
  pipelineId: string | null,
  stageId: string | null
): Promise<{ pipelineId: string; stageId: string }> {
  const pipelines = await listPipelines(db, accountId);
  const pipeline = pipelineId ? pipelines.find((p) => p.id === pipelineId) : pipelines[0];
  if (!pipeline) {
    throw new DealError(pipelineId ? 'Pipeline not found' : 'Account has no pipeline', 404);
  }
  const stage = stageId ? pipeline.stages.find((s) => s.id === stageId) : pipeline.stages[0];
  if (!stage) {
    throw new DealError(stageId ? 'Stage not found in this pipeline' : 'Pipeline has no stages', 404);
  }
  return { pipelineId: pipeline.id, stageId: stage.id };
}

export async function getDealById(
  db: SupabaseClient,
  accountId: string,
  id: string
): Promise<ApiDeal | null> {
  const { data } = await db
    .from('deals')
    .select(DEAL_SELECT)
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();
  return data ? serializeDeal(data as Record<string, unknown>) : null;
}

function parseValue(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) throw new DealError("'value' must be a number >= 0", 400);
  return n;
}

function parseCloseDate(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new DealError("'expected_close_date' must be YYYY-MM-DD or null", 400);
  }
  return raw;
}

export async function createDeal(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<ApiDeal> {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw new DealError("'title' is required", 400);
  const contactId = typeof body.contact_id === 'string' ? body.contact_id : '';
  if (!contactId) throw new DealError("'contact_id' is required", 400);

  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!contact) throw new DealError('Contact not found', 404);

  const { pipelineId, stageId } = await resolvePipelineStage(
    db,
    accountId,
    typeof body.pipeline_id === 'string' ? body.pipeline_id : null,
    typeof body.stage_id === 'string' ? body.stage_id : null
  );

  // Same currency rule as automations: the account's default (issue #218).
  const { data: acct } = await db
    .from('accounts')
    .select('default_currency')
    .eq('id', accountId)
    .maybeSingle();

  const { data, error } = await db
    .from('deals')
    .insert({
      account_id: accountId,
      user_id: userId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      contact_id: contactId,
      title,
      value: body.value === undefined ? 0 : parseValue(body.value),
      currency: acct?.default_currency ?? 'USD',
      notes: typeof body.notes === 'string' ? body.notes : null,
      expected_close_date:
        body.expected_close_date === undefined ? null : parseCloseDate(body.expected_close_date),
      status: 'open',
    })
    .select(DEAL_SELECT)
    .single();
  if (error || !data) {
    console.error('[api/v1/deals] create error:', error);
    throw new DealError('Failed to create deal', 500);
  }
  return serializeDeal(data as Record<string, unknown>);
}

/**
 * PATCH core. Moving stage is checked against the deal's own pipeline.
 * A transition into won/lost fires the same `deal.won` / `deal.lost`
 * webhook the dashboard fires; a webhook failure never fails the PATCH.
 */
export async function updateDeal(
  db: SupabaseClient,
  accountId: string,
  id: string,
  body: Record<string, unknown>
): Promise<ApiDeal> {
  const current = await getDealById(db, accountId, id);
  if (!current) throw new DealError('Deal not found', 404);

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new DealError("'title' must be a non-empty string", 400);
    }
    patch.title = body.title.trim();
  }
  if (body.value !== undefined) patch.value = parseValue(body.value);
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      throw new DealError("'notes' must be a string or null", 400);
    }
    patch.notes = body.notes;
  }
  if (body.expected_close_date !== undefined) {
    patch.expected_close_date = parseCloseDate(body.expected_close_date);
  }
  if (body.stage_id !== undefined) {
    if (typeof body.stage_id !== 'string') throw new DealError("'stage_id' must be a string", 400);
    const { stageId } = await resolvePipelineStage(db, accountId, current.pipeline_id, body.stage_id);
    patch.stage_id = stageId;
  }
  if (body.status !== undefined) {
    if (!isDealStatus(body.status)) {
      throw new DealError(`'status' must be one of: ${DEAL_STATUSES.join(', ')}`, 400);
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) {
    throw new DealError(
      'Nothing to update: send title, value, notes, expected_close_date, stage_id or status',
      400
    );
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await db.from('deals').update(patch).eq('id', id).eq('account_id', accountId);
  if (error) {
    console.error('[api/v1/deals] update error:', error);
    throw new DealError('Failed to update deal', 500);
  }

  const closedNow =
    (patch.status === 'won' || patch.status === 'lost') && patch.status !== current.status;
  if (closedNow) {
    try {
      await dispatchDealOutcome({ db, admin: db, accountId, dealId: id });
    } catch (e) {
      console.warn('[api/v1/deals] outcome webhook failed (deal still saved):', e);
    }
  }

  const updated = await getDealById(db, accountId, id);
  if (!updated) throw new DealError('Deal not found', 404);
  return updated;
}
