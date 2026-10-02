import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseIcsEvents,
  fetchIcsBusyIntervals,
  clearIcsCache,
  sanitizeIcalUrl,
  validateAndFetchIcs,
} from './ical';

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
DTSTART:20261012T130000Z
DTEND:20261012T140000Z
UID:event-1@google.com
SUMMARY:Alinhamento de Projeto
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20261012T180000Z
DTEND:20261012T190000Z
UID:event-2@google.com
SUMMARY:Reunião Externa
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20261012T200000Z
DTEND:20261012T210000Z
UID:event-3@google.com
SUMMARY:Evento Cancelado
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261015
DTEND;VALUE=DATE:20261016
UID:event-all-day@google.com
SUMMARY:Feriado / Folga
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

describe('iCal Parser & Google Calendar integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearIcsCache();
  });

  describe('parseIcsEvents', () => {
    it('parses valid VEVENT entries ignoring cancelled ones', () => {
      const events = parseIcsEvents(SAMPLE_ICS);
      expect(events.length).toBe(3); // 2 timed events + 1 all-day event (event-3 cancelled is excluded)
      expect(events[0].summary).toBe('Alinhamento de Projeto');
      expect(events[0].start.toISOString()).toBe('2026-10-12T13:00:00.000Z');
      expect(events[0].end.toISOString()).toBe('2026-10-12T14:00:00.000Z');
    });

    it('correctly handles all-day events', () => {
      const events = parseIcsEvents(SAMPLE_ICS);
      const allDay = events.find((e) => e.summary === 'Feriado / Folga');
      expect(allDay).toBeDefined();
      expect(allDay?.start).toBeInstanceOf(Date);
      expect(allDay?.end).toBeInstanceOf(Date);
    });

    it('returns empty array on empty or invalid ICS content', () => {
      expect(parseIcsEvents('')).toEqual([]);
      expect(parseIcsEvents('INVALID CONTENT')).toEqual([]);
    });
  });

  describe('fetchIcsBusyIntervals', () => {
    it('fetches ICS from URL and returns intervals for the requested date', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_ICS,
      } as Response);

      const targetDate = new Date('2026-10-12T00:00:00-03:00');
      const busy = await fetchIcsBusyIntervals({
        icsUrl: 'https://calendar.google.com/calendar/ical/test/basic.ics',
        targetDate,
      });

      // Events on 2026-10-12
      expect(busy.length).toBe(2);
      expect(busy[0].start.toISOString()).toBe('2026-10-12T13:00:00.000Z');
    });

    it('returns empty array if fetch fails or network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      const busy = await fetchIcsBusyIntervals({
        icsUrl: 'https://calendar.google.com/calendar/ical/test/basic.ics',
        targetDate: new Date('2026-10-12T00:00:00-03:00'),
      });

      expect(busy).toEqual([]);
    });

    it('returns empty array if no icsUrl is provided', async () => {
      const busy = await fetchIcsBusyIntervals({
        targetDate: new Date('2026-10-12T00:00:00-03:00'),
      });
      expect(busy).toEqual([]);
    });
  });

  describe('sanitizeIcalUrl', () => {
    it('removes GOOGLE_CALENDAR_ICAL_URL= prefix and quotes', () => {
      expect(
        sanitizeIcalUrl('GOOGLE_CALENDAR_ICAL_URL="https://calendar.google.com/calendar/ical/test/basic.ics"')
      ).toBe('https://calendar.google.com/calendar/ical/test/basic.ics');
      expect(
        sanitizeIcalUrl("GOOGLE_CALENDAR_ICAL_URL='https://calendar.google.com/calendar/ical/test/basic.ics'")
      ).toBe('https://calendar.google.com/calendar/ical/test/basic.ics');
      expect(
        sanitizeIcalUrl('GOOGLE_CALENDAR_ICAL_URL = https://calendar.google.com/calendar/ical/test/basic.ics')
      ).toBe('https://calendar.google.com/calendar/ical/test/basic.ics');
    });

    it('cleans up raw urls with spaces or quotes', () => {
      expect(sanitizeIcalUrl('  "https://calendar.google.com/basic.ics"  ')).toBe(
        'https://calendar.google.com/basic.ics'
      );
    });
  });

  describe('validateAndFetchIcs', () => {
    it('returns valid true and event count on real calendar content', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => SAMPLE_ICS,
      } as Response);

      const res = await validateAndFetchIcs('https://calendar.google.com/calendar/ical/test/basic.ics');
      expect(res.valid).toBe(true);
      expect(res.eventsCount).toBe(3);
    });

    it('returns valid false when content is not a vcalendar', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<html>Not a calendar</html>',
      } as Response);

      const res = await validateAndFetchIcs('https://calendar.google.com/wrong');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('não é um arquivo de calendário');
    });

    it('handles 404 and 403 HTTP errors with user-friendly messages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const res = await validateAndFetchIcs('https://calendar.google.com/calendar/ical/test/basic.ics');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('404');
    });
  });
});
