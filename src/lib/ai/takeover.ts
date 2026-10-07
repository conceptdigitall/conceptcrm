// ============================================================
// Pause / resume the AI auto-reply bot on one conversation — the
// inbox "Take over" / "Resume AI" banner, shared with the public API
// (`PATCH /api/v1/conversations/:id`) so both paths behave the same.
//
// The caller passes its own client (RLS-scoped in the dashboard,
// service-role in the API); every query is filtered by accountId
// anyway, so a foreign conversation is simply not found.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export class TakeoverError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export interface SetAiPauseInput {
  paused: boolean
  /**
   * Only used when pausing: assign the thread to this user (the usual
   * "Take over" flow, which fires `on_conversation_assigned`).
   * Omit/null to pause without touching the assignment.
   */
  assignTo?: string | null
}

export async function setConversationAiPause(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  { paused, assignTo }: SetAiPauseInput,
): Promise<void> {
  // Confirm the conversation is in the caller's account before writing.
  const { data: conv, error: convErr } = await db
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (convErr) {
    console.error('[ai/takeover] conversation lookup error:', convErr)
    throw new TakeoverError('Failed to load conversation', 500)
  }
  if (!conv) throw new TakeoverError('Conversation not found', 404)

  const update: Record<string, unknown> = { ai_autoreply_disabled: paused }

  if (paused) {
    if (assignTo) update.assigned_agent_id = assignTo
  } else {
    // Resuming hands the thread *back to the bot*. Clear the pause and
    // the handoff note, and — crucially — release ANY assignment, not
    // just the caller's own: the auto-reply eligibility gate stands
    // down whenever a human is assigned, so leaving a stale assignee
    // (e.g. the agent a prior handoff routed to) would silently keep
    // the bot muted and make "Resume AI" a no-op. This is the explicit
    // choice to let the bot own the thread again.
    update.assigned_agent_id = null
    // Give the bot a fresh reply budget on this thread. Both callers are
    // deliberate, rate-limited actions (dashboard button, or an API key
    // holding `conversations:write`), not something that fires per message.
    update.ai_reply_count = 0
    update.ai_handoff_summary = null
  }

  const { error: upErr } = await db
    .from('conversations')
    .update(update)
    .eq('id', conversationId)
    .eq('account_id', accountId)
  if (upErr) {
    console.error('[ai/takeover] update error:', upErr)
    throw new TakeoverError('Failed to update conversation', 500)
  }
}
