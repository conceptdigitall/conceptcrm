import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { setConversationAiPause, TakeoverError } from '@/lib/ai/takeover'

type Params = { params: Promise<{ conversationId: string }> }

/**
 * POST /api/ai/autoreply/[conversationId]  (agent+)
 *
 * Toggle the AI auto-reply bot for one conversation from the inbox — the
 * "Take over" / "Resume AI" banner.
 *
 * Body: { paused: boolean, assign_to_me?: boolean }
 *   - paused: true  → pause the bot here (a human is taking over). When
 *                     `assign_to_me` is set, also assign the thread to the
 *                     caller (the usual "Take over" flow). Assignment
 *                     fires the `on_conversation_assigned` trigger.
 *   - paused: false → hand the thread back to the bot: clear the pause,
 *                     reset the per-conversation reply count so it gets
 *                     fresh slots, and clear the handoff note. If the
 *                     caller currently owns the thread, unassign it too so
 *                     the bot isn't blocked by the "human owns this" gate.
 *
 * Writes go through the RLS-scoped SSR client, so a conversation outside
 * the caller's account simply isn't found (404).
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    // Reuse the send bucket: this is a cheap per-user inbox action and
    // toggling it in a tight loop has no legitimate use.
    const limit = checkRateLimit(`ai-takeover:${userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    const { conversationId } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body.paused !== 'boolean') {
      return NextResponse.json(
        { error: 'paused (boolean) is required' },
        { status: 400 },
      )
    }
    const paused = body.paused as boolean
    const assignToMe = body.assign_to_me === true

    try {
      await setConversationAiPause(supabase, accountId, conversationId, {
        paused,
        assignTo: assignToMe ? userId : null,
      })
    } catch (err) {
      if (err instanceof TakeoverError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      throw err
    }

    return NextResponse.json({ success: true, paused })
  } catch (err) {
    return toErrorResponse(err)
  }
}
