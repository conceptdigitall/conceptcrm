import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Liga a recepcionista no webhook da Evolution: com reception_settings.enabled a
// resposta vem de runReception; senão, o robô antigo (generateClaudeReply) segue igual.

const ACCOUNT = '0d7c1a52-6f7e-4f43-9a7e-2f2a8f0c1b11'
const OWNER = '9b1f3c55-0000-4000-8000-000000000001'
const CONTACT = 'c0000000-0000-4000-8000-000000000001'
const CONV = 'cv000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  create: vi.fn(),
  loadSettings: vi.fn(),
  runReception: vi.fn(),
  buildReceptionDeps: vi.fn(),
  transcribe: vi.fn(),
  paused: false,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.create }
  },
}))
vi.mock('@/lib/reception/store', () => ({ loadSettings: h.loadSettings }))
vi.mock('@/lib/reception/run', () => ({ runReception: h.runReception, buildReceptionDeps: h.buildReceptionDeps }))
vi.mock('@/lib/reception/audio', () => ({ transcribeEvolutionAudio: h.transcribe }))

type Call = { table: string; op: string; args: unknown[] }
const calls: Call[] = []

function result(table: string, ops: string[]) {
  if (table === 'accounts') return { data: { id: ACCOUNT, owner_user_id: OWNER }, error: null }
  if (table === 'whatsapp_config') return { data: { user_id: OWNER }, error: null }
  if (table === 'contacts') return { data: { id: CONTACT }, error: null }
  if (table === 'conversations') {
    return { data: { id: CONV, unread_count: 0, ai_autoreply_disabled: h.paused }, error: null }
  }
  if (table === 'messages') {
    if (ops.includes('upsert')) return { data: [{ id: 'm1' }], error: null }
    if (ops.includes('order')) return { data: [], error: null } // histórico do robô antigo
    return { data: null, error: null }
  }
  return { data: null, error: null }
}

function builder(table: string) {
  const ops: string[] = []
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'limit', 'order', 'insert', 'update', 'upsert', 'in', 'single']) {
    b[op] = (...args: unknown[]) => {
      ops.push(op)
      calls.push({ table, op, args })
      return b
    }
  }
  b.maybeSingle = async () => result(table, ops)
  b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
    Promise.resolve().then(() => result(table, ops)).then(ok, fail)
  return b
}

const fakeDb = { from: (table: string) => builder(table) }
vi.mock('@/lib/ai/admin-client', () => ({ supabaseAdmin: () => fakeDb }))

// EVOLUTION_* são lidas quando o módulo carrega.
process.env.EVOLUTION_API_URL = 'https://evo.test'
process.env.EVOLUTION_API_KEY = 'evo-key'
process.env.EVOLUTION_INSTANCE_NAME = 'inst'
const { POST } = await import('./route')

const SETTINGS = {
  accountId: ACCOUNT,
  enabled: true,
  pipelineId: 'p1',
  stageIds: { novo: 's1', agendado: 's2', morno: 's3', curioso: 's4', humano: 's5' },
  plansUrl: 'https://concept.test/planos',
  lastHealthAlertAt: null,
}

function inbound(message: Record<string, unknown> = { conversation: 'Oi, sou dentista' }) {
  return new Request('http://localhost:3000/api/whatsapp/evolution-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-evolution-secret': 's3cret' },
    body: JSON.stringify({
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5513988887777@s.whatsapp.net', fromMe: false, id: 'WAMSG1' },
        pushName: 'Ana Souza',
        message,
      },
    }),
  })
}

let fetchMock: ReturnType<typeof vi.fn>
const sentTexts = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).includes('/message/sendText/'))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)).text as string)
const inserts = (table: string) => calls.filter((c) => c.table === table && c.op === 'insert').map((c) => c.args[0])
const upserts = (table: string) => calls.filter((c) => c.table === table && c.op === 'upsert').map((c) => c.args[0])

async function run(req: Request) {
  const p = POST(req)
  await vi.runAllTimersAsync()
  return p
}

describe('POST /api/whatsapp/evolution-webhook: recepcionista', () => {
  const originalEnv = process.env

  beforeEach(() => {
    calls.length = 0
    h.paused = false
    process.env = { ...originalEnv, EVOLUTION_WEBHOOK_SECRET: 's3cret', CRM_ACCOUNT_ID: ACCOUNT, ANTHROPIC_API_KEY: 'sk-test' }
    vi.useFakeTimers()
    fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    h.create.mockResolvedValue({ content: [{ type: 'text', text: 'Resposta do robô antigo' }] })
    h.buildReceptionDeps.mockReturnValue({ fake: 'deps' })
    h.runReception.mockResolvedValue('Oi Ana! Qual o seu nicho?')
    h.loadSettings.mockResolvedValue(SETTINGS)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('enabled: true responde pela recepcionista e não chama o Claude antigo', async () => {
    const res = await run(inbound())

    expect(res.status).toBe(200)
    expect(h.loadSettings).toHaveBeenCalledWith(fakeDb, ACCOUNT)
    expect(h.runReception).toHaveBeenCalledTimes(1)
    expect(h.runReception.mock.calls[0][0]).toMatchObject({
      accountId: ACCOUNT,
      userId: OWNER,
      contactId: CONTACT,
      conversationId: CONV,
      senderName: 'Ana Souza',
      senderPhone: '5513988887777',
      text: 'Oi, sou dentista',
      settings: SETTINGS,
    })
    expect(h.runReception.mock.calls[0][1]).toEqual({ fake: 'deps' })
    const [db, acc, now, send] = h.buildReceptionDeps.mock.calls[0]
    expect(db).toBe(fakeDb)
    expect(acc).toBe(ACCOUNT)
    expect(now).toBeInstanceOf(Date)
    expect(typeof send).toBe('function')
    expect(h.create).not.toHaveBeenCalled()

    expect(sentTexts()).toEqual(['Oi Ana! Qual o seu nicho?'])
    expect(inserts('messages')).toContainEqual(
      expect.objectContaining({ conversation_id: CONV, content_text: 'Oi Ana! Qual o seu nicho?', sender_type: 'bot' }),
    )
    // presença humana mantida
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/chat/sendPresence/'))).toBe(true)
  })

  it('enabled: false segue o caminho antigo', async () => {
    h.loadSettings.mockResolvedValue({ ...SETTINGS, enabled: false })

    const res = await run(inbound())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(h.runReception).not.toHaveBeenCalled()
    expect(h.create).toHaveBeenCalled()
    expect(sentTexts()).toEqual(['Resposta do robô antigo'])
  })

  it('sem configuração (null) segue o caminho antigo', async () => {
    h.loadSettings.mockResolvedValue(null)

    await run(inbound())

    expect(h.runReception).not.toHaveBeenCalled()
    expect(h.create).toHaveBeenCalled()
  })

  it('loadSettings lançando erro: loga e cai no caminho antigo, sem 500', async () => {
    h.loadSettings.mockRejectedValue(new Error('db fora'))

    const res = await run(inbound())

    expect(res.status).toBe(200)
    expect(h.runReception).not.toHaveBeenCalled()
    expect(h.create).toHaveBeenCalled()
    expect(sentTexts()).toEqual(['Resposta do robô antigo'])
  })

  it('runReception devolvendo null: não envia nada nem grava mensagem do bot', async () => {
    h.runReception.mockResolvedValue(null)

    const res = await run(inbound())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'reception_silent' })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/message/sendText'))).toBe(false)
    expect(inserts('messages')).toEqual([])
    expect(h.create).not.toHaveBeenCalled()
  })

  it('áudio transcrito: grava como audio com a transcrição e a recepcionista recebe o texto', async () => {
    h.transcribe.mockResolvedValue('sou dentista em Santos')

    await run(inbound({ audioMessage: { seconds: 4, mimetype: 'audio/ogg; codecs=opus' } }))

    expect(h.transcribe).toHaveBeenCalledWith('WAMSG1')
    expect(upserts('messages')).toContainEqual(
      expect.objectContaining({ content_type: 'audio', content_text: 'sou dentista em Santos', sender_type: 'customer' }),
    )
    expect(h.runReception.mock.calls[0][0].text).toBe('sou dentista em Santos')
  })

  it('áudio transcrito também vale para o robô antigo', async () => {
    h.loadSettings.mockResolvedValue(null)
    h.transcribe.mockResolvedValue('quanto custa um site?')

    await run(inbound({ audioMessage: { seconds: 4 } }))

    expect(h.create).toHaveBeenCalled()
    const msgs = h.create.mock.calls[0][0].messages as { role: string; content: string }[]
    expect(JSON.stringify(msgs)).toContain('quanto custa um site?')
  })

  it('áudio sem transcrição: grava [áudio] e pede por escrito, sem chamar recepcionista nem Claude', async () => {
    h.transcribe.mockResolvedValue(null)

    const res = await run(inbound({ audioMessage: { seconds: 4 } }))

    expect(res.status).toBe(200)
    expect(upserts('messages')).toContainEqual(expect.objectContaining({ content_type: 'audio', content_text: '[áudio]' }))
    expect(sentTexts()).toEqual(['Não consegui ouvir o áudio, pode me mandar por escrito?'])
    expect(inserts('messages')).toContainEqual(
      expect.objectContaining({ content_text: 'Não consegui ouvir o áudio, pode me mandar por escrito?', sender_type: 'bot' }),
    )
    expect(h.runReception).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })

  it('áudio sem transcrição com IA pausada: grava, mas não responde', async () => {
    h.transcribe.mockResolvedValue(null)
    h.paused = true

    const res = await run(inbound({ audioMessage: { seconds: 4 } }))

    expect(await res.json()).toEqual({ status: 'ai_paused' })
    expect(upserts('messages')).toContainEqual(expect.objectContaining({ content_type: 'audio', content_text: '[áudio]' }))
    expect(sentTexts()).toEqual([])
  })

  it('não loga telefone completo nem a transcrição', async () => {
    h.transcribe.mockResolvedValue('segredo do lead')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await run(inbound({ audioMessage: { seconds: 4 } }))

    const all = log.mock.calls.flat().map(String).join('\n')
    expect(all).not.toContain('5513988887777')
    expect(all).not.toContain('segredo do lead')
    expect(all).toContain('***7777')
  })
})
