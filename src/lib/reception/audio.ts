// Transcreve um áudio do WhatsApp recebido pela Evolution API.
// 1) baixa o áudio em base64 pela Evolution (v2: POST /chat/getBase64FromMediaMessage/{instance});
// 2) transcreve com Whisper: Groq (GROQ_API_KEY) tem prioridade, senão OpenAI (OPENAI_API_KEY).
// Qualquer falha devolve null. Nunca loga a transcrição.

const DEFAULT_EVOLUTION_URL = 'https://evolution-api-production-0d4c.up.railway.app'
const DEFAULT_INSTANCE = 'concept-atendimento'
/** Orçamento total (download + Whisper) dentro dos 60 s do webhook. */
const TOTAL_BUDGET_MS = 15000

export interface TranscribeDeps {
  fetchImpl?: typeof fetch
}

function pickProvider(): { url: string; model: string; key: string } | null {
  const groq = process.env.GROQ_API_KEY
  if (groq) {
    return { url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3-turbo', key: groq }
  }
  const openai = process.env.OPENAI_API_KEY
  if (openai) return { url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1', key: openai }
  return null
}

function extensionFor(mimetype: string): string {
  const m = mimetype.toLowerCase()
  if (m.includes('ogg') || m.includes('opus')) return 'ogg'
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('wav')) return 'wav'
  if (m.includes('webm')) return 'webm'
  return 'ogg'
}

export async function transcribeEvolutionAudio(messageKeyId: string, deps: TranscribeDeps = {}): Promise<string | null> {
  try {
    const provider = pickProvider()
    const evolutionKey = process.env.EVOLUTION_API_KEY
    if (!provider || !evolutionKey || !messageKeyId) {
      if (!provider) console.warn('[reception/audio] Sem GROQ_API_KEY nem OPENAI_API_KEY; áudio não transcrito')
      return null
    }
    const f = deps.fetchImpl ?? fetch
    // Um único sinal para as duas chamadas: o tempo do download conta no da transcrição.
    const signal = AbortSignal.timeout(TOTAL_BUDGET_MS)
    const evolutionUrl = process.env.EVOLUTION_API_URL || DEFAULT_EVOLUTION_URL
    const instance = process.env.EVOLUTION_INSTANCE_NAME || DEFAULT_INSTANCE

    const mediaRes = await f(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { key: { id: messageKeyId } }, convertToMp4: false }),
      signal,
    })
    if (!mediaRes.ok) {
      console.warn('[reception/audio] Evolution não devolveu o áudio:', mediaRes.status)
      return null
    }
    const media = (await mediaRes.json()) as { base64?: string; mimetype?: string }
    if (!media?.base64) {
      console.warn('[reception/audio] Evolution devolveu áudio vazio')
      return null
    }
    const mimetype = (media.mimetype || 'audio/ogg').split(';')[0].trim()
    const bytes = Buffer.from(media.base64, 'base64')

    const form = new FormData()
    form.append('file', new Blob([bytes], { type: mimetype }), `audio.${extensionFor(mimetype)}`)
    form.append('model', provider.model)
    form.append('language', 'pt')

    const sttRes = await f(provider.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.key}` },
      body: form,
      signal,
    })
    if (!sttRes.ok) {
      console.warn('[reception/audio] Transcrição falhou:', sttRes.status)
      return null
    }
    const out = (await sttRes.json()) as { text?: string }
    const text = String(out?.text ?? '').trim()
    return text || null
  } catch (err) {
    console.warn('[reception/audio] Erro ao transcrever áudio:', err instanceof Error ? err.message : 'erro desconhecido')
    return null
  }
}
