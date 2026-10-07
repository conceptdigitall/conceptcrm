import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Banco dividido entre lojas: o robô tem de gravar na conta deste deploy
// (CRM_ACCOUNT_ID), nunca no primeiro whatsapp_config que achar.

const ACCOUNT = '0d7c1a52-6f7e-4f43-9a7e-2f2a8f0c1b11';
const OWNER = '9b1f3c55-0000-4000-8000-000000000001';

type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];

function result(table: string) {
  if (table === 'accounts') return { data: { id: ACCOUNT, owner_user_id: OWNER }, error: null };
  if (table === 'whatsapp_config') return { data: null, error: null };
  // Para logo depois de decidir a conta: o resto do atendimento não interessa aqui.
  throw new Error(`parou em ${table}`);
}

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'limit', 'order', 'insert', 'update', 'in', 'single']) {
    b[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return b;
    };
  }
  b.maybeSingle = async () => result(table);
  b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
    Promise.resolve().then(() => result(table)).then(ok, fail);
  return b;
}

vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: () => ({ from: (table: string) => builder(table) }),
}));

const { POST } = await import('./route');

function inbound() {
  return new Request('http://localhost:3000/api/whatsapp/evolution-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-evolution-secret': 's3cret' },
    body: JSON.stringify({
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5533988887777@s.whatsapp.net', fromMe: false },
        pushName: 'Cliente',
        message: { conversation: 'Oi, tem detergente?' },
      },
    }),
  });
}

const eqOn = (table: string) =>
  calls.filter((c) => c.table === table && c.op === 'eq').map((c) => c.args);

describe('POST /api/whatsapp/evolution-webhook: conta deste deploy', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    calls.length = 0;
    process.env = { ...originalEnv, EVOLUTION_WEBHOOK_SECRET: 's3cret' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('com CRM_ACCOUNT_ID, busca conta, config e contato só dessa conta', async () => {
    process.env.CRM_ACCOUNT_ID = ACCOUNT;

    await POST(inbound());

    expect(eqOn('accounts')).toContainEqual(['id', ACCOUNT]);
    expect(eqOn('whatsapp_config')).toContainEqual(['account_id', ACCOUNT]);
    expect(eqOn('contacts')).toContainEqual(['account_id', ACCOUNT]);
    // Nunca o modo antigo: whatsapp_config sem filtro de conta.
    expect(eqOn('whatsapp_config').every(([col]) => col === 'account_id')).toBe(true);
  });

  it('sem CRM_ACCOUNT_ID, segue o modo antigo (primeira whatsapp_config, sem filtro)', async () => {
    delete process.env.CRM_ACCOUNT_ID;

    await POST(inbound());

    expect(calls.some((c) => c.table === 'whatsapp_config')).toBe(true);
    expect(eqOn('whatsapp_config')).toEqual([]);
  });
});
