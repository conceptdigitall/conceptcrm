/**
 * Leitura das mensagens que a Evolution API (Baileys) entrega no webhook.
 *
 * Antes o webhook só entendia `conversation` e `extendedTextMessage`;
 * o resto era descartado. Agora entram também áudio e documento
 * (`messages.content_type` text, audio, document). Foto, vídeo,
 * figurinha, localização e template continuam fora, por decisão do João.
 */

export type EvolutionContentType = 'text' | 'audio' | 'document';

export interface ParsedEvolutionMessage {
  contentType: EvolutionContentType;
  /** Texto ou legenda. Pode ser vazio em mídia sem legenda. */
  text: string;
  /** true quando há arquivo para baixar da Evolution. */
  hasMedia: boolean;
  mimeType: string | null;
  fileName: string | null;
  templateName: string | null;
}

/** Ação de protocolo: cliente apagou ou editou uma mensagem anterior. */
export type EvolutionProtocolAction =
  | { kind: 'revoke'; targetId: string }
  | { kind: 'edit'; targetId: string; text: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

/** Tira os envelopes (efêmera, visualização única, doc com legenda). */
export function unwrapMessage(message: Raw): Raw {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Converte a mensagem bruta. Devolve null para o que não deve virar
 * mensagem na inbox (reação, protocolo, enquete vazia, chamada…).
 */
export function parseEvolutionMessage(message: Raw): ParsedEvolutionMessage | null {
  const m = unwrapMessage(message);
  if (!m || typeof m !== 'object') return null;

  const base = { hasMedia: false, mimeType: null, fileName: null, templateName: null };

  if (m.conversation || m.extendedTextMessage) {
    const text = str(m.conversation) || str(m.extendedTextMessage?.text);
    return text.trim() ? { ...base, contentType: 'text', text } : null;
  }

  // Por decisão do João, só áudio e documento entram no CRM. Foto, vídeo,
  // figurinha, localização e template são ignorados.
  const media: Array<[string, EvolutionContentType]> = [
    ['audioMessage', 'audio'],
    ['documentMessage', 'document'],
  ];
  for (const [field, contentType] of media) {
    const node = m[field];
    if (!node) continue;
    const fileName = str(node.fileName) || null;
    return {
      contentType,
      text: str(node.caption) || (contentType === 'document' ? fileName || '' : ''),
      hasMedia: true,
      mimeType: str(node.mimetype) || null,
      fileName,
      templateName: null,
    };
  }

  if (m.contactMessage || m.contactsArrayMessage) {
    const names: string[] = m.contactMessage
      ? [str(m.contactMessage.displayName)]
      : (m.contactsArrayMessage.contacts || []).map((c: Raw) => str(c?.displayName));
    return { ...base, contentType: 'text', text: `📇 Contato: ${names.filter(Boolean).join(', ') || 'compartilhado'}` };
  }

  if (m.buttonsResponseMessage) {
    const text = str(m.buttonsResponseMessage.selectedDisplayText);
    return text ? { ...base, contentType: 'text', text } : null;
  }
  if (m.listResponseMessage) {
    const text = str(m.listResponseMessage.title) || str(m.listResponseMessage.singleSelectReply?.selectedRowId);
    return text ? { ...base, contentType: 'text', text } : null;
  }
  if (m.templateButtonReplyMessage) {
    const text = str(m.templateButtonReplyMessage.selectedDisplayText);
    return text ? { ...base, contentType: 'text', text } : null;
  }
  if (m.interactiveMessage) {
    const text = str(m.interactiveMessage.body?.text);
    return text ? { ...base, contentType: 'text', text } : null;
  }
  if (m.pollCreationMessage || m.pollCreationMessageV3) {
    const p = m.pollCreationMessage || m.pollCreationMessageV3;
    return { ...base, contentType: 'text', text: `📊 Enquete: ${str(p.name)}` };
  }

  return null;
}

/** Apagar para todos (REVOKE = 0) ou edição (MESSAGE_EDIT = 14). */
export function parseProtocolAction(message: Raw): EvolutionProtocolAction | null {
  const p = message?.protocolMessage;
  if (!p) return null;
  const targetId = str(p.key?.id);
  if (!targetId) return null;
  const type = p.type;
  if (type === 0 || type === 'REVOKE') return { kind: 'revoke', targetId };
  if (type === 14 || type === 'MESSAGE_EDIT') {
    const edited = parseEvolutionMessage(p.editedMessage);
    if (edited?.text) return { kind: 'edit', targetId, text: edited.text };
  }
  return null;
}

/** Texto curto para a prévia da conversa (lista da inbox). */
export function previewText(parsed: ParsedEvolutionMessage): string {
  if (parsed.text.trim()) return parsed.text;
  switch (parsed.contentType) {
    case 'audio':
      return '🎤 Áudio';
    case 'document':
      return '📄 Documento';
    default:
      return '';
  }
}

/**
 * Status de entrega do Baileys → vocabulário de `messages.status`.
 * Aceita o nome (DELIVERY_ACK) ou o número do enum.
 */
export function mapEvolutionStatus(status: unknown): 'sent' | 'delivered' | 'read' | 'failed' | null {
  const s = String(status ?? '').toUpperCase();
  if (s === 'ERROR' || s === '0') return 'failed';
  if (s === 'SERVER_ACK' || s === '2') return 'sent';
  if (s === 'DELIVERY_ACK' || s === '3') return 'delivered';
  if (s === 'READ' || s === 'PLAYED' || s === '4' || s === '5') return 'read';
  return null;
}

/** Status que podem ser substituídos por `next` (nunca volta de lido para entregue). */
export function statusesBelow(next: 'sent' | 'delivered' | 'read' | 'failed'): string[] {
  if (next === 'read') return ['sending', 'sent', 'delivered'];
  if (next === 'delivered') return ['sending', 'sent'];
  if (next === 'sent') return ['sending'];
  return ['sending'];
}

export const DELETED_PREFIX = '🚫 Mensagem apagada';

/** Marca o texto como apagado mantendo o original para consulta. */
export function markDeletedText(original: string | null | undefined): string {
  const o = (original ?? '').trim();
  if (o.startsWith(DELETED_PREFIX)) return o;
  return o ? `${DELETED_PREFIX}\n(antes: ${o})` : DELETED_PREFIX;
}

/**
 * Para quem responder. Se o cliente escreveu por @lid, responde pelo
 * mesmo @lid: responder pelo número cria uma conversa paralela no
 * celular (foi o caso da Camila). O número fica como reserva.
 */
export function replyTargets(remoteJid: string, peerNumber: string): string[] {
  const out: string[] = [];
  if (remoteJid.endsWith('@lid')) out.push(remoteJid);
  if (peerNumber && peerNumber.length >= 10) out.push(peerNumber);
  else if (remoteJid && !out.includes(remoteJid)) out.push(remoteJid);
  return out;
}
