import { mirrorInboundMedia, type MirrorStorage } from './mirror-inbound-media';
import type { ParsedEvolutionMessage } from './evolution-message';

/**
 * Baixa a mídia de uma mensagem da Evolution (base64) e guarda no bucket
 * `chat-media`, o mesmo das mídias da API oficial. Melhor esforço: em
 * qualquer falha devolve null e a mensagem entra sem arquivo, com o
 * aviso "indisponível" da inbox, em vez de derrubar o webhook.
 */
export async function mirrorEvolutionMedia(args: {
  storage: MirrorStorage;
  accountId: string;
  messageId: string;
  parsed: ParsedEvolutionMessage;
  messageTimestamp?: string | number | null;
  evolution: { url: string; apiKey: string; instance: string };
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const { storage, accountId, messageId, parsed, messageTimestamp, evolution } = args;
  const fetchImpl = args.fetchImpl ?? fetch;
  if (!parsed.hasMedia || !messageId) return null;

  let mimeFromApi: string | null = null;
  const download = async () => {
    const res = await fetchImpl(
      `${evolution.url}/chat/getBase64FromMediaMessage/${evolution.instance}`,
      {
        method: 'POST',
        headers: { apikey: evolution.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
      },
    );
    if (!res.ok) throw new Error(`Evolution getBase64 ${res.status}`);
    const data = (await res.json()) as { base64?: string; mimetype?: string };
    if (!data?.base64) throw new Error('Evolution getBase64 sem conteúdo');
    mimeFromApi = data.mimetype ?? null;
    return {
      buffer: Buffer.from(data.base64, 'base64'),
      contentType: data.mimetype || parsed.mimeType || 'application/octet-stream',
    };
  };

  return mirrorInboundMedia({
    storage,
    accountId,
    mediaId: `evo-${messageId}`,
    downloadUrl: '',
    accessToken: '',
    mimeType: parsed.mimeType ?? mimeFromApi,
    fileName: parsed.fileName,
    messageTimestamp,
    download,
  });
}
