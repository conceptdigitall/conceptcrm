import { describe, expect, it, vi } from 'vitest'
import {
  DELETED_PREFIX,
  mapEvolutionStatus,
  markDeletedText,
  parseEvolutionMessage,
  parseProtocolAction,
  previewText,
  replyTargets,
  statusesBelow,
} from './evolution-message'
import { mirrorEvolutionMedia } from './evolution-media'

describe('parseEvolutionMessage', () => {
  it('reads plain and extended text', () => {
    expect(parseEvolutionMessage({ conversation: 'oi' })?.text).toBe('oi')
    expect(parseEvolutionMessage({ extendedTextMessage: { text: 'link' } })?.contentType).toBe('text')
    expect(parseEvolutionMessage({ conversation: '   ' })).toBeNull()
  })

  it('keeps only audio and documents', () => {
    const audio = parseEvolutionMessage({ audioMessage: { mimetype: 'audio/ogg; codecs=opus' }, messageContextInfo: {} })
    expect(audio).toMatchObject({ contentType: 'audio', hasMedia: true, text: '', mimeType: 'audio/ogg; codecs=opus' })

    const doc = parseEvolutionMessage({
      documentWithCaptionMessage: { message: { documentMessage: { fileName: 'proposta.pdf', mimetype: 'application/pdf' } } },
    })
    expect(doc).toMatchObject({ contentType: 'document', fileName: 'proposta.pdf', text: 'proposta.pdf' })
  })

  it('ignores photo, video, sticker, location and template', () => {
    expect(parseEvolutionMessage({ imageMessage: { caption: 'olha', mimetype: 'image/jpeg' } })).toBeNull()
    expect(parseEvolutionMessage({ videoMessage: {} })).toBeNull()
    expect(parseEvolutionMessage({ stickerMessage: { mimetype: 'image/webp' } })).toBeNull()
    expect(parseEvolutionMessage({ locationMessage: { degreesLatitude: -23.9, degreesLongitude: -46.4 } })).toBeNull()
    expect(
      parseEvolutionMessage({ templateMessage: { hydratedTemplate: { hydratedContentText: 'Promo' } } }),
    ).toBeNull()
  })

  it('unwraps ephemeral and view-once envelopes', () => {
    expect(parseEvolutionMessage({ ephemeralMessage: { message: { conversation: 'some' } } })?.text).toBe('some')
    expect(parseEvolutionMessage({ viewOnceMessageV2: { message: { audioMessage: {} } } })?.contentType).toBe('audio')
  })

  it('reads button replies, ignores reactions and protocol', () => {
    expect(parseEvolutionMessage({ buttonsResponseMessage: { selectedDisplayText: 'Sim' } })?.text).toBe('Sim')
    expect(parseEvolutionMessage({ reactionMessage: { text: '❤️' } })).toBeNull()
    expect(parseEvolutionMessage({ protocolMessage: { type: 0 } })).toBeNull()
    expect(parseEvolutionMessage(null)).toBeNull()
  })
})

describe('previewText', () => {
  it('uses the caption or a label for media', () => {
    expect(previewText({ contentType: 'audio', text: '', hasMedia: true, mimeType: null, fileName: null, templateName: null })).toBe('🎤 Áudio')
    expect(previewText({ contentType: 'document', text: 'proposta.pdf', hasMedia: true, mimeType: null, fileName: null, templateName: null })).toBe('proposta.pdf')
  })
})

describe('parseProtocolAction', () => {
  it('detects delete-for-everyone and edits', () => {
    expect(parseProtocolAction({ protocolMessage: { type: 0, key: { id: 'X1' } } })).toEqual({ kind: 'revoke', targetId: 'X1' })
    expect(parseProtocolAction({ protocolMessage: { type: 'REVOKE', key: { id: 'X1' } } })?.kind).toBe('revoke')
    expect(
      parseProtocolAction({ protocolMessage: { type: 14, key: { id: 'X2' }, editedMessage: { conversation: 'novo' } } }),
    ).toEqual({ kind: 'edit', targetId: 'X2', text: 'novo' })
    expect(parseProtocolAction({ conversation: 'oi' })).toBeNull()
    expect(parseProtocolAction({ protocolMessage: { type: 3, key: { id: 'X' } } })).toBeNull()
  })
})

describe('status mapping', () => {
  it('maps Baileys acks and never goes backwards', () => {
    expect(mapEvolutionStatus('DELIVERY_ACK')).toBe('delivered')
    expect(mapEvolutionStatus('READ')).toBe('read')
    expect(mapEvolutionStatus('PLAYED')).toBe('read')
    expect(mapEvolutionStatus(3)).toBe('delivered')
    expect(mapEvolutionStatus('PENDING')).toBeNull()
    expect(statusesBelow('delivered')).not.toContain('read')
    expect(statusesBelow('read')).toContain('delivered')
  })
})

describe('markDeletedText', () => {
  it('keeps the original and is idempotent', () => {
    const once = markDeletedText('oi')
    expect(once.startsWith(DELETED_PREFIX)).toBe(true)
    expect(once).toContain('oi')
    expect(markDeletedText(once)).toBe(once)
    expect(markDeletedText(null)).toBe(DELETED_PREFIX)
  })
})

describe('replyTargets', () => {
  it('answers through the same @lid first, phone as fallback', () => {
    expect(replyTargets('58037893107744@lid', '5513991382442')).toEqual(['58037893107744@lid', '5513991382442'])
    expect(replyTargets('5513991382442@s.whatsapp.net', '5513991382442')).toEqual(['5513991382442'])
  })
})

describe('mirrorEvolutionMedia', () => {
  const parsed = { contentType: 'audio' as const, text: '', hasMedia: true, mimeType: 'audio/ogg; codecs=opus', fileName: null, templateName: null }
  const evolution = { url: 'https://evo.test', apiKey: 'k', instance: 'i' }

  it('downloads base64 from Evolution and uploads to chat-media', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const storage = {
      from: () => ({ upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }) }),
    }
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ base64: Buffer.from('abc').toString('base64'), mimetype: 'audio/ogg' }), { status: 200 }),
    )
    const url = await mirrorEvolutionMedia({ storage, accountId: 'acc', messageId: 'MSG1', parsed, evolution, fetchImpl })
    expect(url).toMatch(/^https:\/\/cdn\/account-acc\/inbound\/evo-MSG1/)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://evo.test/chat/getBase64FromMediaMessage/i')
    expect(upload).toHaveBeenCalledOnce()
  })

  it('returns null instead of throwing when Evolution fails', async () => {
    const storage = { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }))
    expect(await mirrorEvolutionMedia({ storage, accountId: 'acc', messageId: 'M', parsed, evolution, fetchImpl })).toBeNull()
  })
})
