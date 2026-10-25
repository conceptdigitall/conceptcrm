import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadInstagramCredentials, saveInstagramConnection } from './instagram-connection';

describe('instagram-connection', () => {
  it('grava o token cifrado e lê de volta só para a conta pedida', async () => {
    let stored: Record<string, unknown> = {};
    const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: stored, error: null }) }));
    const db = {
      from: () => ({
        upsert: async (row: Record<string, unknown>) => {
          stored = row;
          return { error: null };
        },
        select: () => ({ eq }),
      }),
    } as unknown as SupabaseClient;

    await saveInstagramConnection(db, { accountId: 'a', userId: 'u', igUserId: '1784100000001', username: 'loja', accessToken: 'tok_teste_segredo' });
    expect(stored.access_token).not.toContain('tok_teste_segredo');

    const creds = await loadInstagramCredentials(db, 'a');
    expect(eq).toHaveBeenCalledWith('account_id', 'a');
    expect(creds).toEqual({ igUserId: '1784100000001', accessToken: 'tok_teste_segredo' });
  });
});
