import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from './route';
import * as configLib from '@/lib/calendar/config';

describe('API /api/calendar/config', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET', () => {
    it('returns current calendar configuration', async () => {
      vi.spyOn(configLib, 'getCalendarConfig').mockReturnValue({
        configured: true,
        mode: 'ical',
        hasIcal: true,
        maskedIcalUrl: 'https://calendar.google.com/.../basic.ics',
        calendarId: 'primary',
      });

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.configured).toBe(true);
      expect(data.mode).toBe('ical');
      expect(data.maskedIcalUrl).toContain('basic.ics');
    });
  });

  describe('POST', () => {
    it('saves valid icalUrl successfully', async () => {
      vi.spyOn(configLib, 'saveCalendarIcalUrl').mockResolvedValue({
        success: true,
        eventsCount: 3,
        calendarName: 'Concept Digital',
        maskedUrl: 'https://calendar.google.com/.../basic.ics',
      });

      const req = new Request('http://localhost:3000/api/calendar/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icalUrl: 'https://calendar.google.com/test.ics' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.eventsCount).toBe(3);
      expect(data.calendarName).toBe('Concept Digital');
    });

    it('returns 400 when icalUrl is missing or invalid', async () => {
      vi.spyOn(configLib, 'saveCalendarIcalUrl').mockRejectedValue(
        new Error('URL inválida. O link deve começar com https://')
      );

      const req = new Request('http://localhost:3000/api/calendar/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icalUrl: 'bad-url' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('URL inválida');
    });
  });

  describe('DELETE', () => {
    it('removes ical configuration', async () => {
      vi.spyOn(configLib, 'removeCalendarIcalUrl').mockResolvedValue({ success: true });

      const res = await DELETE();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('desconectada');
    });
  });
});
