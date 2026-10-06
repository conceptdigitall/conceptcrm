import { describe, it, expect } from 'vitest'

import { recordingDb } from '@/lib/api/v1/recording-db.test-utils'
import { setConversationAiPause, TakeoverError } from './takeover'

const found = () => ({ data: { id: 'cv-1' } })

describe('setConversationAiPause', () => {
  it('pauses and assigns, scoped to the account', async () => {
    const { db, ops } = recordingDb(found)
    await setConversationAiPause(db, 'acc-1', 'cv-1', { paused: true, assignTo: 'u-1' })
    expect(ops[0].filters).toEqual({ id: 'cv-1', account_id: 'acc-1' })
    expect(ops[1]).toMatchObject({
      action: 'update',
      payload: { ai_autoreply_disabled: true, assigned_agent_id: 'u-1' },
      filters: { id: 'cv-1', account_id: 'acc-1' },
    })
  })

  it('pauses without touching the assignment when no assignee is given', async () => {
    const { db, ops } = recordingDb(found)
    await setConversationAiPause(db, 'acc-1', 'cv-1', { paused: true, assignTo: null })
    expect(ops[1].payload).toEqual({ ai_autoreply_disabled: true })
  })

  it('resuming releases the thread and resets the reply budget', async () => {
    const { db, ops } = recordingDb(found)
    await setConversationAiPause(db, 'acc-1', 'cv-1', { paused: false })
    expect(ops[1].payload).toEqual({
      ai_autoreply_disabled: false,
      assigned_agent_id: null,
      ai_reply_count: 0,
      ai_handoff_summary: null,
    })
  })

  it('404s for a conversation of another account and never writes', async () => {
    const { db, ops } = recordingDb(() => ({ data: null }))
    await expect(
      setConversationAiPause(db, 'acc-1', 'cv-x', { paused: true }),
    ).rejects.toMatchObject({ status: 404 })
    expect(ops.some((o) => o.action === 'update')).toBe(false)
  })

  it('reports DB failures as 500', async () => {
    const { db } = recordingDb((op) =>
      op.action === 'update' ? { error: { message: 'boom' } } : found(),
    )
    await expect(
      setConversationAiPause(db, 'acc-1', 'cv-1', { paused: true }),
    ).rejects.toBeInstanceOf(TakeoverError)
  })
})
