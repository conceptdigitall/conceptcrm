import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { deploymentAccountScope } from '@/lib/deployment-account'
import { alertStuckHotLeads, checkEvolutionHealth, drainReceptionJobs } from '@/lib/reception/jobs'
import { notifyOps } from '@/lib/reception/ops'

/**
 * Cron da recepcionista: lembretes, follow-ups e saúde da Evolution.
 * Exige `x-cron-secret` igual a AUTOMATION_CRON_SECRET.
 */

async function sendEvolution(number: string, text: string): Promise<unknown> {
  const url = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-0d4c.up.railway.app'
  const key = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME || 'concept-atendimento'
  if (!key) throw new Error('Evolution API não configurada (EVOLUTION_API_KEY ausente)')
  let clean = number.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '')
  if (clean.length >= 10 && clean.length <= 11 && !clean.startsWith('55')) clean = '55' + clean
  const res = await fetch(`${url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: clean, text }),
  })
  if (!res.ok) throw new Error(`Evolution respondeu ${res.status}`)
  return res.json()
}

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (suppliedBuf.length !== expectedBuf.length || !timingSafeEqual(suppliedBuf, expectedBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let scoped: string | null
  try {
    scoped = deploymentAccountScope()
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  try {
    const db = supabaseAdmin()
    let accountIds: string[]
    if (scoped) {
      accountIds = [scoped]
    } else {
      const { data, error } = await db.from('reception_settings').select('account_id').eq('enabled', true)
      if (error) throw new Error(error.message)
      accountIds = (data ?? []).map((r: { account_id: string }) => r.account_id)
    }

    const notify = (text: string) => notifyOps(text, { sendWhatsApp: sendEvolution })
    const now = new Date()
    let done = 0
    let failed = 0
    let errors = 0
    const health: Record<string, 'open' | 'down'> = {}
    for (const accountId of accountIds) {
      try {
        const r = await drainReceptionJobs(db, now, { send: sendEvolution, notify, accountId })
        done += r.done
        failed += r.failed
        await alertStuckHotLeads(db, now, { notify, accountId })
        health[accountId] = await checkEvolutionHealth(db, accountId, now, { notify })
      } catch (err) {
        const msg = (err as Error).message.replace(/\d{8,}/g, '***')
        console.error(`[reception/cron] conta ${accountId.slice(0, 8)} falhou: ${msg}`)
        try {
          await notify(`Cron da recepção falhou para a conta ${accountId.slice(0, 8)}: ${msg}`)
        } catch {}
        errors++
      }
    }
    return NextResponse.json({ done, failed, errors, health })
  } catch (err) {
    console.error('[reception/cron] falhou:', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
