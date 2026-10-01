import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock do supabaseAdmin
const mockSelect = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();
const mockEq = vi.fn();

vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          gte: mockGte.mockReturnValue({
            lte: mockLte.mockResolvedValue({
              data: [
                {
                  scheduled_at: '2026-10-12T14:00:00-03:00',
                  duration_minutes: 30,
                  status: 'confirmed',
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

describe('GET /api/calendar/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if date parameter is missing or invalid', async () => {
    const req = new NextRequest('http://localhost:3000/api/calendar/availability');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('data');
  });

  it('returns availability and suggestions for a valid business day', async () => {
    const req = new NextRequest('http://localhost:3000/api/calendar/availability?date=2026-10-12&duration=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isWorkingDay).toBe(true);
    expect(json.suggestedSlots.length).toBeGreaterThan(0);
    expect(json.formattedWhatsApp).toBeDefined();
    // 14:00 was mocked as busy in Supabase
    expect(json.availableSlots.some((s: { time: string }) => s.time === '14:00')).toBe(false);
  });

  it('handles Sunday correctly as non-working day', async () => {
    const req = new NextRequest('http://localhost:3000/api/calendar/availability?date=2026-10-11'); // Sunday
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isWorkingDay).toBe(false);
    expect(json.availableSlots).toEqual([]);
    expect(json.suggestedSlots).toEqual([]);
  });
});
