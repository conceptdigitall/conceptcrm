import type { SupabaseClient } from '@supabase/supabase-js'

import type { ReceptionSettings } from './types'

function fail(op: string, error: { message?: string } | null): never {
  throw new Error(`[reception/crm] ${op}: ${error?.message ?? 'erro desconhecido'}`)
}

/** Reuse the contact's active deal in the reception pipeline, or create one in stage `novo`. */
export async function ensureDeal(
  db: SupabaseClient,
  a: {
    accountId: string
    userId: string
    contactId: string
    conversationId: string
    settings: ReceptionSettings
    title: string
  },
): Promise<string> {
  const { data: existing } = await db
    .from('deals')
    .select('id')
    .eq('account_id', a.accountId)
    .eq('contact_id', a.contactId)
    .eq('pipeline_id', a.settings.pipelineId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data, error } = await db
    .from('deals')
    .insert({
      account_id: a.accountId,
      user_id: a.userId,
      pipeline_id: a.settings.pipelineId,
      stage_id: a.settings.stageIds.novo,
      contact_id: a.contactId,
      conversation_id: a.conversationId,
      title: a.title,
      value: 0,
      currency: 'BRL',
      status: 'active',
    })
    .select('id')
    .single()
  if (error || !data) fail('ensureDeal', error)
  return data.id as string
}

export async function moveDeal(db: SupabaseClient, dealId: string, stageId: string): Promise<void> {
  const { error } = await db
    .from('deals')
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq('id', dealId)
  if (error) fail('moveDeal', error)
}

/** Find-or-create the tag by (account_id, name) and link it idempotently. */
export async function tagContact(
  db: SupabaseClient,
  a: { accountId: string; userId: string; contactId: string; tagName: string },
): Promise<void> {
  const { data: found } = await db
    .from('tags')
    .select('id')
    .eq('account_id', a.accountId)
    .eq('name', a.tagName)
    .maybeSingle()
  let tagId = found?.id as string | undefined
  if (!tagId) {
    const { data, error } = await db
      .from('tags')
      .insert({ account_id: a.accountId, user_id: a.userId, name: a.tagName })
      .select('id')
      .single()
    if (error || !data) fail('tagContact(tag)', error)
    tagId = data.id as string
  }
  const { error } = await db
    .from('contact_tags')
    .upsert({ contact_id: a.contactId, tag_id: tagId }, { onConflict: 'contact_id,tag_id' })
  if (error) fail('tagContact(link)', error)
}

export async function pauseAi(db: SupabaseClient, conversationId: string, summary: string): Promise<void> {
  const { error } = await db
    .from('conversations')
    .update({ ai_autoreply_disabled: true, ai_handoff_summary: summary })
    .eq('id', conversationId)
  if (error) fail('pauseAi', error)
}

export async function addNote(
  db: SupabaseClient,
  a: { contactId: string; userId: string; text: string },
): Promise<void> {
  const { error } = await db
    .from('contact_notes')
    .insert({ contact_id: a.contactId, user_id: a.userId, note_text: a.text })
  if (error) fail('addNote', error)
}
