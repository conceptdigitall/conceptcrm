import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isGoogleCalendarConfigured,
  generateDirectGoogleCalendarUrl,
  createCalendarEvent,
  getCalendarAvailability,
} from './google';

describe('Google Calendar service & unified integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('isGoogleCalendarConfigured', () => {
    it('detects service_account when credentials are present', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL = 'bot@concept.iam.gserviceaccount.com';
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...';
      const status = isGoogleCalendarConfigured();
      expect(status.hasServiceAccount).toBe(true);
      expect(status.mode).toBe('service_account');
    });

    it('detects ical mode when only iCal URL is provided', () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
      delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
      process.env.GOOGLE_CALENDAR_ICAL_URL = 'https://calendar.google.com/calendar/ical/test/basic.ics';

      const status = isGoogleCalendarConfigured();
      expect(status.hasServiceAccount).toBe(false);
      expect(status.hasIcal).toBe(true);
      expect(status.mode).toBe('ical');
    });

    it('returns local_crm mode when no external credentials exist', () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
      delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
      delete process.env.GOOGLE_CALENDAR_ICAL_URL;
      delete process.env.GOOGLE_CALENDAR_WEBHOOK_URL;

      const status = isGoogleCalendarConfigured();
      expect(status.mode).toBe('local_crm');
    });
  });

  describe('generateDirectGoogleCalendarUrl', () => {
    it('creates universal web URL with Google Meet and details', () => {
      const url = generateDirectGoogleCalendarUrl({
        title: 'Reunião Diagnóstico Concept Digital',
        startDate: new Date('2026-10-12T14:00:00-03:00'),
        durationMinutes: 30,
        details: 'Alinhamento estratégico',
        location: 'https://meet.google.com/new',
      });

      expect(url).toContain('https://calendar.google.com/calendar/render?');
      expect(url).toContain('action=TEMPLATE');
      expect(url).toContain('Reuni%C3%A3o+Diagn%C3%B3stico+Concept+Digital');
    });
  });

  describe('createCalendarEvent', () => {
    it('returns meeting url and google calendar event details in local/direct mode', async () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
      delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

      const result = await createCalendarEvent({
        title: 'Sessão de Diagnóstico - Dr. André',
        startDate: new Date('2026-10-12T15:00:00-03:00'),
        durationMinutes: 30,
        clientName: 'Dr. André',
        clientEmail: 'andre@clinica.com.br',
        notes: 'Clínica odontológica interessada em IA no WhatsApp',
      });

      expect(result.meetUrl).toBeDefined();
      expect(result.meetUrl.startsWith('https://meet.google.com/')).toBe(true);
      expect(result.calendarUrl).toBeDefined();
      expect(result.eventId).toBeDefined();
    });

    it('dispatches to webhook if GOOGLE_CALENDAR_WEBHOOK_URL is configured', async () => {
      process.env.GOOGLE_CALENDAR_WEBHOOK_URL = 'https://n8n.conceptdigital.com.br/webhook/calendar';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ eventId: 'n8n-evt-123' }),
      } as Response);

      const result = await createCalendarEvent({
        title: 'Sessão com Cliente',
        startDate: new Date('2026-10-12T15:00:00-03:00'),
        durationMinutes: 30,
      });

      expect(global.fetch).toHaveBeenCalled();
      expect(result.eventId).toBe('n8n-evt-123');
    });
  });

  describe('getCalendarAvailability', () => {
    it('calculates available and suggested slots for a given day', async () => {
      // Future Monday
      const monday = new Date('2026-10-12T00:00:00-03:00');
      const availability = await getCalendarAvailability({
        targetDate: monday,
        durationMinutes: 30,
        existingBusyIntervals: [
          {
            start: new Date('2026-10-12T10:00:00-03:00'),
            end: new Date('2026-10-12T11:00:00-03:00'),
          },
        ],
      });

      expect(availability.availableSlots.length).toBeGreaterThan(0);
      expect(availability.suggestedSlots.length).toBeLessThanOrEqual(3);
      expect(availability.formattedWhatsApp).toBeDefined();
      // Should not include 10:00 or 10:30
      expect(availability.availableSlots.some((s) => s.time === '10:00')).toBe(false);
      expect(availability.availableSlots.some((s) => s.time === '10:30')).toBe(false);
    });
  });
});
