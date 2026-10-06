// ============================================================
// GET   /api/v1/conversations/{id} — read one conversation
//                                    (scope: conversations:read)
// PATCH /api/v1/conversations/{id} — pause / resume the AI auto-reply
//                                    (scope: conversations:write)
//
// PATCH body: { "ai_paused": true|false, "assign_to_me"?: boolean }.
// Same core as the inbox "Take over" / "Resume AI" banner
// (`setConversationAiPause`). `assign_to_me` assigns the thread to the
// user who created the API key. Account-scoped: a foreign id → 404.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from '@/lib/inbox/conversations';
import { serializeConversation } from '@/lib/api/v1/conversations';
import { setConversationAiPause, TakeoverError } from '@/lib/ai/takeover';
import type { Conversation } from '@/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'conversations:read');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/conversations] read error:', error);
      return fail('internal', 'Failed to read conversation', 500);
    }
    if (!data) return fail('not_found', 'Conversation not found', 404);

    return ok(serializeConversation(normalizeConversation(data as Conversation)));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'conversations:write');
    const { id } = await params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.ai_paused !== 'boolean') {
      return fail('bad_request', "'ai_paused' (boolean) is required", 400);
    }

    await setConversationAiPause(ctx.supabase, ctx.accountId, id, {
      paused: body.ai_paused,
      assignTo: body.assign_to_me === true ? ctx.createdBy : null,
    });

    const { data } = await ctx.supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!data) return fail('not_found', 'Conversation not found', 404);
    return ok(serializeConversation(normalizeConversation(data as Conversation)));
  } catch (err) {
    if (err instanceof TakeoverError) {
      return err.status === 404
        ? fail('not_found', err.message, 404)
        : fail('internal', 'Failed to update conversation', err.status);
    }
    return toApiErrorResponse(err);
  }
}
