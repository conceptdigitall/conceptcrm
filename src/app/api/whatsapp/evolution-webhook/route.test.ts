import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { POST } from './route';

describe('POST /api/whatsapp/evolution-webhook authentication', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects with 401 when EVOLUTION_WEBHOOK_SECRET is not configured on server', async () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;

    const req = new Request('http://localhost:3000/api/whatsapp/evolution-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-evolution-secret': 'some-secret',
      },
      body: JSON.stringify({ event: 'messages.upsert' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('rejects with 401 when secret header is missing', async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'correct-secret-123';

    const req = new Request('http://localhost:3000/api/whatsapp/evolution-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event: 'messages.upsert' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('rejects with 401 when secret header is incorrect', async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'correct-secret-123';

    const req = new Request('http://localhost:3000/api/whatsapp/evolution-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-evolution-secret': 'wrong-secret',
      },
      body: JSON.stringify({ event: 'messages.upsert' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('accepts request when valid secret is provided via x-evolution-secret header', async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'correct-secret-123';

    const req = new Request('http://localhost:3000/api/whatsapp/evolution-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-evolution-secret': 'correct-secret-123',
      },
      body: JSON.stringify({ event: 'other.event' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ignored_not_upsert');
  });
});
