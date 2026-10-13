// Mede quanto a Laya concorda com o Haiku (gabarito) nas respostas da recepcionista.
// Uso: npm run reception:eval   (precisa de LAYA_URL e ANTHROPIC_API_KEY em .env.local)
// Sai com código 1 se a concordância total ficar abaixo de 85%.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { layaBatch } from '@/lib/laya/client'
import { arbitrateWithClaude } from '@/lib/laya/claude-arbitrator'
import { makeClassify, readAnswer, type StageReading } from '@/lib/reception/classify'
import type { ReceptionSession, ReceptionStage } from '@/lib/reception/types'

const THRESHOLD = 0.85

interface Item { stage: 'interesse' | 'momento' | 'urgencia' | 'humano'; text: string }

const items: Item[] = JSON.parse(readFileSync(join(process.cwd(), 'worker/scripts/reception-eval.json'), 'utf8'))

const session = (stage: ReceptionStage): ReceptionSession => ({
  id: 'eval', accountId: 'eval', contactId: 'eval', conversationId: 'eval', dealId: null,
  stage, answers: {}, unclearCount: 0, outcome: null, score: null, origin: 'eval',
  offeredSlots: [], slotRounds: 0, appointmentId: null,
})

// Pedido de humano é checado antes de qualquer etapa; usa 'nicho' para isolar essa checagem.
const stageOf = (s: Item['stage']): ReceptionStage => (s === 'humano' ? 'nicho' : s)

const layaUrl = process.env.LAYA_URL
if (!layaUrl) throw new Error('LAYA_URL não configurada')
if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada')

// Só Laya: sem fallback. Se não tiver certeza, devolve 'indefinido'.
const layaOnly = makeClassify({
  laya: async (text, question) => (await layaBatch(layaUrl, [text], question, { timeoutMs: 2500, maxAttempts: 1 }))[0],
  haiku: async () => 'indefinido',
})
// Só Haiku: o gabarito.
const haikuOnly = makeClassify({ haiku: (text, question, options) => arbitrateWithClaude(text, question, options) })

const key = (r: StageReading) => JSON.stringify(r)

async function main() {
  const byStage = new Map<string, { ok: number; total: number }>()
  const failures: string[] = []
  for (const item of items) {
    const st = stageOf(item.stage)
    const [laya, haiku] = await Promise.all([
      readAnswer(st, item.text, session(st), layaOnly),
      readAnswer(st, item.text, session(st), haikuOnly),
    ])
    const agree = key(laya) === key(haiku)
    const row = byStage.get(item.stage) ?? { ok: 0, total: 0 }
    row.total++
    if (agree) row.ok++
    byStage.set(item.stage, row)
    if (!agree) failures.push(`[${item.stage}] "${item.text}" -> Laya ${key(laya)} | Haiku ${key(haiku)}`)
  }

  let ok = 0
  let total = 0
  for (const [stage, r] of byStage) {
    console.log(`${stage.padEnd(10)} ${r.ok}/${r.total}  ${((r.ok / r.total) * 100).toFixed(0)}%`)
    ok += r.ok
    total += r.total
  }
  const rate = ok / total
  console.log(`${'total'.padEnd(10)} ${ok}/${total}  ${(rate * 100).toFixed(0)}%`)
  if (failures.length) console.log('\nDivergências:\n' + failures.join('\n'))
  if (rate < THRESHOLD) {
    console.error(`\nAbaixo de ${THRESHOLD * 100}%.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
