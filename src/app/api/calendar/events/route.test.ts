import { describe, it, expect, vi, beforeEach } from 'vitest';
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
