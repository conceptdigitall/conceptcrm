import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { transcribeEvolutionAudio } from './audio'

type Call = { url: string; init: RequestInit }

function fakeFetch(opts: { evolutionOk?: boolean; transcript?: string; sttOk?: boolean } = {}) {
  const calls: Call[] = []
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init: init ?? {} })
    if (u.includes('/chat/getBase64FromMediaMessage/')) {
      if (opts.evolutionOk === false) return new Response('boom', { status: 500 })
      return Response.json({ base64: Buffer.from('fake-ogg').toString('base64'), mimetype: 'audio/ogg; codecs=opus' })
    }
    if (u.includes('/audio/transcriptions')) {
      if (opts.sttOk === false) return new Response('nope', { status: 401 })
      return Response.json({ text: opts.transcript ?? '  quero saber dos planos  ' })
    }
    throw new Error(`url inesperada: ${u}`)
  })
  return { f: f as unknown as typeof fetch, calls }
}

describe('transcribeEvolutionAudio', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      EVOLUTION_API_URL: 'https://evo.test',
      EVOLUTION_API_KEY: 'evo-key',
      EVOLUTION_INSTANCE_NAME: 'inst',
    }
    delete process.env.GROQ_API_KEY
    delete process.env.OPENAI_API_KEY
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('busca o áudio na Evolution e usa a Groq quando há GROQ_API_KEY (prioridade sobre OpenAI)', async () => {
    process.env.GROQ_API_KEY = 'groq-key'
    process.env.OPENAI_API_KEY = 'openai-key'
    const { f, calls } = fakeFetch()

    const text = await transcribeEvolutionAudio('MSG123', { fetchImpl: f })

    expect(text).toBe('quero saber dos planos')
    expect(calls[0].url).toBe('https://evo.test/chat/getBase64FromMediaMessage/inst')
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe('evo-key')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ message: { key: { id: 'MSG123' } }, convertToMp4: false })

    expect(calls[1].url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer groq-key')
    const form = calls[1].init.body as FormData
    expect(form.get('model')).toBe('whisper-large-v3-turbo')
    expect(form.get('language')).toBe('pt')
    expect(form.get('file')).toBeInstanceOf(Blob)
    expect(calls.some((c) => c.url.includes('api.openai.com'))).toBe(false)
  })

  it('sem GROQ_API_KEY, usa a OpenAI com whisper-1', async () => {
    process.env.OPENAI_API_KEY = 'openai-key'
    const { f, calls } = fakeFetch()

    const text = await transcribeEvolutionAudio('MSG123', { fetchImpl: f })

    expect(text).toBe('quero saber dos planos')
    expect(calls[1].url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect((calls[1].init.body as FormData).get('model')).toBe('whisper-1')
  })

  it('erro da Evolution devolve null e não chama o Whisper', async () => {
    process.env.GROQ_API_KEY = 'groq-key'
    const { f, calls } = fakeFetch({ evolutionOk: false })

    expect(await transcribeEvolutionAudio('MSG123', { fetchImpl: f })).toBeNull()
    expect(calls.some((c) => c.url.includes('/audio/transcriptions'))).toBe(false)
  })

  it('sem chave de transcrição, devolve null sem buscar o áudio', async () => {
    const { f, calls } = fakeFetch()
    expect(await transcribeEvolutionAudio('MSG123', { fetchImpl: f })).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('erro do Whisper ou transcrição vazia devolve null', async () => {
    process.env.GROQ_API_KEY = 'groq-key'
    expect(await transcribeEvolutionAudio('MSG123', { fetchImpl: fakeFetch({ sttOk: false }).f })).toBeNull()
    expect(await transcribeEvolutionAudio('MSG123', { fetchImpl: fakeFetch({ transcript: '   ' }).f })).toBeNull()
  })

  it('fetch que lança devolve null', async () => {
    process.env.GROQ_API_KEY = 'groq-key'
    const f = vi.fn(async () => {
      throw new Error('rede caiu')
    }) as unknown as typeof fetch
    expect(await transcribeEvolutionAudio('MSG123', { fetchImpl: f })).toBeNull()
  })
})
