// Instagram de cada conta. A tabela `instagram_connections` não tem policy
// nenhuma (migration 055): só o servidor lê, com service role, e o token
// fica cifrado. Nada aqui devolve o token para o cliente.
import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

const TABLE = 'instagram_connections';

export interface InstagramConnectionStatus {
  connected: boolean;
  username: string | null;
  ig_user_id: string | null;
  last_error: string | null;
  updated_at: string | null;
}

export interface InstagramCredentials {
  accessToken: string;
  igUserId: string;
}

export const IG_USER_ID_RE = /^[0-9]{5,30}$/;
// Tokens da Meta são longos e sem espaço; o teto só barra lixo colado.
export const ACCESS_TOKEN_RE = /^[A-Za-z0-9_\-.|]{20,1024}$/;

export async function getInstagramStatus(admin: SupabaseClient, accountId: string): Promise<InstagramConnectionStatus> {
  const { data, error } = await admin
    .from(TABLE)
    .select('ig_user_id, username, last_error, updated_at')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { connected: false, username: null, ig_user_id: null, last_error: null, updated_at: null };
  return { connected: true, ...data } as InstagramConnectionStatus;
}

/** Credenciais da conta para publicar, ou null se ela não conectou. */
export async function loadInstagramCredentials(
  admin: SupabaseClient,
  accountId: string,
): Promise<InstagramCredentials | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select('ig_user_id, access_token')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { igUserId: data.ig_user_id as string, accessToken: decrypt(data.access_token as string) };
}

export async function saveInstagramConnection(
  admin: SupabaseClient,
  row: { accountId: string; userId: string; igUserId: string; username: string | null; accessToken: string },
): Promise<void> {
  const { error } = await admin.from(TABLE).upsert({
    account_id: row.accountId,
    ig_user_id: row.igUserId,
    username: row.username,
    access_token: encrypt(row.accessToken),
    connected_by: row.userId,
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteInstagramConnection(admin: SupabaseClient, accountId: string): Promise<void> {
  const { error } = await admin.from(TABLE).delete().eq('account_id', accountId);
  if (error) throw error;
}

/** Guarda o último erro da Meta (ex.: token expirado) para a tela de Ajustes avisar. */
export async function recordInstagramError(admin: SupabaseClient, accountId: string, message: string | null): Promise<void> {
  await admin.from(TABLE).update({ last_error: message, updated_at: new Date().toISOString() }).eq('account_id', accountId);
}
