/**
 * Integração com a Meta / Instagram Graph API para publicação de Feed, Reels, Carrossel e Stories.
 * Regras de produção (Graph API v26.0):
 * - Feed Foto: image_url + caption (máx 2200 chars)
 * - Carrossel: 2 a 10 itens com is_carousel_item=true, depois container CAROUSEL
 * - Stories: media_type=STORIES, imagem JPEG ou vídeo MP4 (<60s), sem legenda, aguarda FINISHED
 * - Reels: media_type=REELS, video_url + caption, aguarda FINISHED
 */

export const GRAPH_API_BASE = process.env.META_GRAPH_URL?.replace(/\/+$/, '') || 'https://graph.facebook.com/v26.0';
export const MAX_CAPTION_LENGTH = 2200;
export const POLLING_INTERVAL_MS = 2500;
export const POLLING_TIMEOUT_MS = 180000; // 3 minutos

export interface PublishParams {
  kind: 'feed' | 'story';
  mediaType: 'foto' | 'carrossel' | 'video';
  mediaUrls: string[];
  caption?: string;
  accessToken?: string;
  igUserId?: string;
}

export interface PublishResult {
  mediaId: string;
  permalink?: string;
  publishedAt: string;
}

function mediaPath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export class InstagramApiError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'InstagramApiError';
    this.code = code;
  }
}

function getEnvConfig(accessToken?: string, igUserId?: string): { token: string; userId: string } {
  const token = (accessToken || process.env.META_ACCESS_TOKEN || '').trim();
  const userId = (igUserId || process.env.META_IG_USER_ID || '').trim();
  if (!token) throw new InstagramApiError('Token de acesso do Instagram (META_ACCESS_TOKEN) não configurado.');
  if (!userId) throw new InstagramApiError('ID da conta do Instagram (META_IG_USER_ID) não configurado.');
  return { token, userId };
}

async function graphRequest<T>(
  endpoint: string,
  token: string,
  options: { method?: string; body?: Record<string, unknown>; params?: Record<string, string> } = {},
): Promise<T> {
  const method = options.method || 'GET';
  let url = `${GRAPH_API_BASE}/${endpoint.replace(/^\/+/, '')}`;

  if (options.params) {
    const search = new URLSearchParams(options.params).toString();
    if (search) url += (url.includes('?') ? '&' : '?') + search;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  let reqBody: string | undefined;
  if (method !== 'GET' && options.body) {
    headers['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(options.body);
  }

  const res = await fetch(url, { method, headers, body: reqBody });
  const data = (await res.json().catch(() => null)) as { id?: string; error?: { message: string; code?: number } } | null;

  if (data?.error) {
    const code = data.error.code;
    const msg = data.error.message || 'Erro desconhecido na Meta Graph API';
    if (code === 190) {
      throw new InstagramApiError('Token da Meta expirou ou é inválido. Gere um novo token no painel de desenvolvedores.', code);
    }
    throw new InstagramApiError(`Meta Graph API: ${msg}`, code);
  }

  if (!res.ok || !data) {
    throw new InstagramApiError(`Erro HTTP ${res.status} ao comunicar com a Graph API.`);
  }

  return data as T;
}

async function waitForContainerReady(containerId: string, token: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < POLLING_TIMEOUT_MS) {
    const res = await graphRequest<{ status_code?: string; id: string }>(containerId, token, {
      params: { fields: 'status_code' },
    });
    const status = (res.status_code || '').toUpperCase();
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new InstagramApiError(`Processamento da mídia na Meta falhou com status '${status}'.`);
    }
    await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS));
  }
  throw new InstagramApiError('Tempo limite esgotado aguardando processamento da mídia pelo Instagram.');
}

export async function publishToInstagram(params: PublishParams): Promise<PublishResult> {
  const { token, userId } = getEnvConfig(params.accessToken, params.igUserId);
  const cleanCaption = (params.caption || '').trim();

  if (cleanCaption.length > MAX_CAPTION_LENGTH) {
    throw new InstagramApiError(`Legenda excede o limite do Instagram de ${MAX_CAPTION_LENGTH} caracteres.`);
  }

  const urls = params.mediaUrls.filter(Boolean);
  if (urls.length === 0) {
    throw new InstagramApiError('Nenhuma URL de mídia informada para publicação.');
  }

  let containerId = '';

  if (params.kind === 'story') {
    // Stories: Imagem JPEG ou Vídeo MP4. Meta não aceita legenda visível em stories via API.
    const mediaUrl = urls[0];
    // URL assinada termina em ?token=...: olha só o caminho.
    const isVideo = params.mediaType === 'video' || mediaPath(mediaUrl).endsWith('.mp4');
    const body: Record<string, unknown> = {
      media_type: 'STORIES',
      [isVideo ? 'video_url' : 'image_url']: mediaUrl,
    };
    const res = await graphRequest<{ id: string }>(`${userId}/media`, token, { method: 'POST', body });
    containerId = res.id;
    await waitForContainerReady(containerId, token);
  } else if (params.mediaType === 'carrossel') {
    // Carrossel no feed (2 a 10 itens)
    if (urls.length < 2 || urls.length > 10) {
      throw new InstagramApiError(`Carrossel exige de 2 a 10 mídias (recebeu ${urls.length}).`);
    }

    const childIds: string[] = [];
    for (const itemUrl of urls) {
      const isVideo = mediaPath(itemUrl).endsWith('.mp4');
      const itemBody: Record<string, unknown> = {
        is_carousel_item: true,
        [isVideo ? 'video_url' : 'image_url']: itemUrl,
      };
      if (isVideo) itemBody.media_type = 'VIDEO';
      const itemRes = await graphRequest<{ id: string }>(`${userId}/media`, token, { method: 'POST', body: itemBody });
      if (isVideo) await waitForContainerReady(itemRes.id, token);
      childIds.push(itemRes.id);
    }

    const carouselRes = await graphRequest<{ id: string }>(`${userId}/media`, token, {
      method: 'POST',
      body: {
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption: cleanCaption,
      },
    });
    containerId = carouselRes.id;
  } else if (params.mediaType === 'video') {
    // Reels / Vídeo no feed
    const res = await graphRequest<{ id: string }>(`${userId}/media`, token, {
      method: 'POST',
      body: {
        media_type: 'REELS',
        video_url: urls[0],
        caption: cleanCaption,
      },
    });
    containerId = res.id;
    await waitForContainerReady(containerId, token);
  } else {
    // Foto única no feed
    const res = await graphRequest<{ id: string }>(`${userId}/media`, token, {
      method: 'POST',
      body: {
        image_url: urls[0],
        caption: cleanCaption,
      },
    });
    containerId = res.id;
  }

  // Publicar o container aprovado
  const publishRes = await graphRequest<{ id: string }>(`${userId}/media_publish`, token, {
    method: 'POST',
    body: { creation_id: containerId },
  });

  const mediaId = publishRes.id;
  let permalink: string | undefined;

  try {
    const meta = await graphRequest<{ permalink?: string }>(mediaId, token, {
      params: { fields: 'permalink' },
    });
    permalink = meta.permalink;
  } catch {
    // Se o permalink falhar, o post já foi publicado
  }

  return {
    mediaId,
    permalink,
    publishedAt: new Date().toISOString(),
  };
}
