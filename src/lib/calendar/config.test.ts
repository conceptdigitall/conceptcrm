import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { getCalendarConfig, saveCalendarIcalUrl, removeCalendarIcalUrl } from './config';
import * as icalModule from './ical';
import fs from 'fs';

vi.mock('fs');

describe('Calendar Config Helper', () => {
  const originalEnv = process.env.GOOGLE_CALENDAR_ICAL_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_CALENDAR_ICAL_URL;
  });

  afterAll(() => {
    if (originalEnv) {
      process.env.GOOGLE_CALENDAR_ICAL_URL = originalEnv;
    } else {
      delete process.env.GOOGLE_CALENDAR_ICAL_URL;
    }
  });

  it('reports unconfigured when no env or file exists', () => {
    const config = getCalendarConfig();
    expect(config.hasIcal).toBe(false);
    expect(config.maskedIcalUrl).toBeNull();
  });

  it('masks the ical url when present', () => {
    process.env.GOOGLE_CALENDAR_ICAL_URL =
      'https://calendar.google.com/calendar/ical/conceptdigital%40gmail.com/private-1234567890abcdef/basic.ics';
    const config = getCalendarConfig();
    expect(config.hasIcal).toBe(true);
    expect(config.maskedIcalUrl).toContain('calendar.google.com');
    expect(config.maskedIcalUrl).toContain('basic.ics');
    expect(config.maskedIcalUrl).not.toContain('private-1234567890abcdef');
  });

  it('validates and saves valid ical url', async () => {
    vi.spyOn(icalModule, 'validateAndFetchIcs').mockResolvedValue({
      valid: true,
      eventsCount: 5,
      calendarName: 'Concept Digital',
    });

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => 'FOO=bar\n');
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    const res = await saveCalendarIcalUrl(
      'GOOGLE_CALENDAR_ICAL_URL="https://calendar.google.com/calendar/ical/test/basic.ics"'
    );

    expect(res.success).toBe(true);
    expect(res.eventsCount).toBe(5);
    expect(res.calendarName).toBe('Concept Digital');
    expect(process.env.GOOGLE_CALENDAR_ICAL_URL).toBe(
      'https://calendar.google.com/calendar/ical/test/basic.ics'
    );
    expect(writeSpy).toHaveBeenCalled();
  });

  it('rejects invalid ical url and does not save', async () => {
    vi.spyOn(icalModule, 'validateAndFetchIcs').mockResolvedValue({
      valid: false,
      eventsCount: 0,
      error: 'URL inválida',
    });

    await expect(saveCalendarIcalUrl('invalid-url')).rejects.toThrow('URL inválida');
    expect(process.env.GOOGLE_CALENDAR_ICAL_URL).toBeUndefined();
  });

  it('removes ical url on disconnect', async () => {
    process.env.GOOGLE_CALENDAR_ICAL_URL = 'https://calendar.google.com/test.ics';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      () => 'FOO=bar\nGOOGLE_CALENDAR_ICAL_URL=https://calendar.google.com/test.ics\n'
    );
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    const res = await removeCalendarIcalUrl();
    expect(res.success).toBe(true);
    expect(process.env.GOOGLE_CALENDAR_ICAL_URL).toBeUndefined();
    expect(writeSpy).toHaveBeenCalled();
  });
});
