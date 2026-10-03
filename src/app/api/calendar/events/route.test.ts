import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), contact: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn((err: { status?: number }) =>
    Response.json({ error: 'auth failed' }, { status: err?.status ?? 500 })),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();

vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'appointments') {
        return {
          select: mockSelect.mockReturnValue({
            eq: mockEq.mockReturnValue({
              gte: mockGte.mockReturnValue({
                lte: mockLte.mockResolvedValue({
                  data: [], // sem conflito por padrão
                  error: null,
                }),
              }),
            }),
          }),
          insert: mockInsert.mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'appt-123',
                  title: 'Sessão de Diagnóstico',
                  scheduled_at: '2026-10-12T14:00:00-03:00',
                  duration_minutes: 30,
                  status: 'confirmed',
                  meeting_url: 'https://meet.google.com/new',
                  google_event_id: 'gcal-123',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.contact(), error: null }) }) }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    },
  }),
}));

describe('POST /api/calendar/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'user-1', role: 'agent' });
    mocks.contact.mockReturnValue({ id: 'contact-1' });
  });

  const validBody = {
    scheduled_at: '2026-10-12T14:00:00-03:00',
    duration_minutes: 30,
    client_name: 'Dr. Roberto',
  };

  it('returns 401 without a session and writes nothing', async () => {
    mocks.requireRole.mockRejectedValue({ status: 401 });
    const req = new NextRequest('http://localhost:3000/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('ignores account_id and user_id from the body and uses the session', async () => {
    const req = new NextRequest('http://localhost:3000/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, account_id: 'acc-outra', user_id: 'user-outro' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 'acc-1', user_id: 'user-1' })
    );
  });

  it('returns 404 for a contact from another account', async () => {
    mocks.contact.mockReturnValue(null);
    const req = new NextRequest('http://localhost:3000/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, contact_id: 'contact-de-outra-conta' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns 400 if scheduled_at is missing or invalid', async () => {
    const req = new NextRequest('http://localhost:3000/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('scheduled_at');
  });

  it('returns 400 if date is on Sunday', async () => {
    const req = new NextRequest('http://localhost:3000/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify({
        scheduled_at: '2026-10-11T14:00:00-03:00', // Sunday
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('domingo');
  });

  it('successfully creates appointment and returns meeting link and eventId', async () => {
    const req = new NextRequest('http://localhost:3000/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify({
        scheduled_at: '2026-10-12T14:00:00-03:00',
        duration_minutes: 30,
        client_name: 'Dr. Roberto',
        client_email: 'roberto@clinica.com.br',
        client_phone: '13999998888',
        notes: 'Interesse em agendamento automático',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.appointment).toBeDefined();
    expect(json.meetUrl).toBeDefined();
    expect(json.calendarUrl).toBeDefined();
  });
});
