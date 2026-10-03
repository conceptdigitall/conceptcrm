import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn((err: { status?: number }) =>
    Response.json({ error: 'auth failed' }, { status: err?.status ?? 500 })),
}));

import { GET } from './route';

describe('GET /api/calendar/status', () => {
  beforeEach(() => {
    mocks.requireRole.mockReset();
    mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'user-1', role: 'viewer' });
  });

  it('returns 401 without a session', async () => {
    mocks.requireRole.mockRejectedValue({ status: 401 });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns current calendar configuration status', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.mode).toBeDefined();
    expect(json.businessHours).toBeDefined();
    expect(json.businessHours.workingDaysText).toContain('Segunda a Sábado');
  });
});
