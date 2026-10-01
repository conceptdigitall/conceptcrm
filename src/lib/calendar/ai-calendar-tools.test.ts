import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCheckAvailability, executeScheduleAppointment } from './ai-calendar-tools';

// Mock do supabaseAdmin
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'appointments') {
        return {
          select: mockSelect.mockReturnValue({
            eq: mockEq.mockReturnValue({
              gte: mockGte.mockReturnValue({
                lte: mockLte.mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
          insert: mockInsert.mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'appt-1' }, error: null }),
            }),
          }),
        };
      }
      return {
        update: mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    },
  }),
}));

describe('AI Calendar Tools (WhatsApp integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeCheckAvailability', () => {
    it('returns available slots and WhatsApp-friendly text for business day', async () => {
      // Future Monday
      const result = await executeCheckAvailability({
        date: '2026-10-12',
        durationMinutes: 30,
      });

      expect(result.success).toBe(true);
      expect(result.isWorkingDay).toBe(true);
      expect(result.suggestedSlots.length).toBeGreaterThan(0);
      expect(result.formattedWhatsApp).toContain('às ');
    });

    it('returns not working on Sunday', async () => {
      const result = await executeCheckAvailability({
        date: '2026-10-11', // Sunday
      });

      expect(result.success).toBe(true);
      expect(result.isWorkingDay).toBe(false);
      expect(result.suggestedSlots).toEqual([]);
      expect(result.replyText).toContain('domingo');
    });

    it('filters by morning or afternoon preference', async () => {
      const morningRes = await executeCheckAvailability({
        date: '2026-10-12',
        timePreference: 'manha',
      });

      expect(morningRes.suggestedSlots.every((s) => Number(s.split(':')[0]) < 12)).toBe(true);

      const afternoonRes = await executeCheckAvailability({
        date: '2026-10-12',
        timePreference: 'tarde',
      });

      expect(afternoonRes.suggestedSlots.every((s) => Number(s.split(':')[0]) >= 13)).toBe(true);
    });
  });

  describe('executeScheduleAppointment', () => {
    it('creates appointment in database and returns Google Meet and calendar URLs', async () => {
      const sendMock = vi.fn().mockResolvedValue({ ok: true });

      const result = await executeScheduleAppointment({
        datetimeIso: '2026-10-12T14:30:00-03:00',
        clientName: 'Dr. Leonardo',
        clientCompany: 'Clínica Odonto Prime',
        clientEmail: 'leonardo@odontoprime.com',
        notes: 'Deseja implementar agente de agendamento 24h',
        senderPhone: '5513999998888',
        contactId: 'contact-uuid-1',
        accountId: 'acc-uuid-1',
        userId: 'user-uuid-1',
        sendEvolutionMessage: sendMock,
      });

      expect(result.success).toBe(true);
      expect(result.meetUrl).toBeDefined();
      expect(result.meetUrl.startsWith('https://meet.google.com/')).toBe(true);
      expect(result.replyMessage).toContain('Dr. Leonardo');
      expect(result.replyMessage).toContain(result.meetUrl);
      expect(result.replyMessage).not.toContain('**'); // Regra sem markdown/asteriscos
    });
  });
});
