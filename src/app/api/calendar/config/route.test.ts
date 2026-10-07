import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn((err: { status?: number }) =>
    Response.json({ error: 'auth failed' }, { status: err?.status ?? 500 })),
}));

import { GET, POST, DELETE } from './route';
import * as configLib from '@/lib/calendar/config';

const INTERNAL = 'acc-concept';

describe('API /api/calendar/config', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS', INTERNAL);
    mocks.requireRole.mockReset();
    mocks.requireRole.mockResolvedValue({ accountId: INTERNAL, userId: 'user-1', role: 'admin' });
  });

  describe('auth', () => {
    const post = () => new Request('http://localhost:3000/api/calendar/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icalUrl: 'https://calendar.google.com/x/basic.ics' }),
    });

    it('rejects anonymous callers on GET, POST and DELETE', async () => {
      mocks.requireRole.mockRejectedValue({ status: 401 });
      const save = vi.spyOn(configLib, 'saveCalendarIcalUrl');
      const remove = vi.spyOn(configLib, 'removeCalendarIcalUrl');

      expect((await GET()).status).toBe(401);
      expect((await POST(post())).status).toBe(401);
      expect((await DELETE()).status).toBe(401);
      expect(save).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('requires admin to change the calendar', async () => {
      await POST(post()).catch(() => null);
      await DELETE();
      expect(mocks.requireRole).toHaveBeenCalledWith('admin');
    });

    it('forbids admins of other accounts from changing the shared iCal', async () => {
      mocks.requireRole.mockResolvedValue({ accountId: 'acc-cliente', userId: 'u-2', role: 'owner' });
      const save = vi.spyOn(configLib, 'saveCalendarIcalUrl');
      const remove = vi.spyOn(configLib, 'removeCalendarIcalUrl');

      expect((await POST(post())).status).toBe(403);
      expect((await DELETE()).status).toBe(403);
      expect(save).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });
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
