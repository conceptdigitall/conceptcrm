import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/calendar/google', () => ({
  createCalendarEvent: vi.fn(async () => ({
    eventId: 'evt-1',
    meetUrl: 'https://meet.google.com/new',
    calendarUrl: 'https://calendar.google.com/x',
  })),
}));

import { recordingDb } from '@/lib/api/v1/recording-db.test-utils';
import {
  AppointmentError,
  clampDuration,
  createAppointment,
  loadBusyIntervals,
  parseScheduledAt,
} from './appointments';

describe('parseScheduledAt', () => {
  it('rejects missing and invalid dates with 400', () => {
    expect(() => parseScheduledAt(undefined)).toThrow(AppointmentError);
    expect(() => parseScheduledAt('amanhã')).toThrow('inválida');
  });

  it('rejects Sundays', () => {
    // 2026-10-11 is a Sunday (Brasília noon).
    expect(() => parseScheduledAt('2026-10-11T12:00:00-03:00')).toThrow('domingos');
  });

  it('accepts a weekday', () => {
    expect(parseScheduledAt('2026-10-08T15:00:00-03:00').toISOString()).toBe(
      '2026-10-08T18:00:00.000Z'
    );
  });
});

describe('clampDuration', () => {
  it('keeps 15..120 and defaults to 30', () => {
    expect(clampDuration(5)).toBe(15);
    expect(clampDuration(500)).toBe(120);
    expect(clampDuration('abc')).toBe(30);
    expect(clampDuration(45)).toBe(45);
  });
});

describe('createAppointment', () => {
  const when = '2026-10-08T15:00:00-03:00';

  it('404s when the contact belongs to another account', async () => {
    const { db, ops } = recordingDb(() => ({ data: null }));
    await expect(
      createAppointment(db, 'acc-1', 'user-1', { contact_id: 'c-x', scheduled_at: when })
    ).rejects.toMatchObject({ status: 404 });
    expect(ops[0]).toMatchObject({
      table: 'contacts',
      filters: { id: 'c-x', account_id: 'acc-1' },
    });
    expect(ops.some((o) => o.action === 'insert')).toBe(false);
  });

  it('inserts with the caller account and user, and scopes the contact update', async () => {
    const { db, ops } = recordingDb((op) =>
      op.table === 'contacts' && op.action === 'select'
        ? { data: { id: 'c-1' } }
        : op.table === 'appointments'
          ? { data: { id: 'ap-1', ...(op.payload as object) } }
          : {}
    );
    const res = await createAppointment(db, 'acc-1', 'user-1', {
      contact_id: 'c-1',
      scheduled_at: when,
      client_name: 'Pollyana',
      duration_minutes: 45,
    });
    expect(res.appointment.id).toBe('ap-1');
    const insert = ops.find((o) => o.table === 'appointments' && o.action === 'insert');
    expect(insert?.payload).toMatchObject({
      account_id: 'acc-1',
      user_id: 'user-1',
      contact_id: 'c-1',
      duration_minutes: 45,
      status: 'confirmed',
      title: 'Sessão de Diagnóstico & Demonstração - Pollyana',
    });
    const update = ops.find((o) => o.table === 'contacts' && o.action === 'update');
    expect(update?.filters).toEqual({ id: 'c-1', account_id: 'acc-1' });
  });

  it('reports DB failures as 500', async () => {
    const { db } = recordingDb((op) =>
      op.table === 'appointments' ? { data: null, error: { message: 'boom' } } : {}
    );
    await expect(
      createAppointment(db, 'acc-1', 'user-1', { scheduled_at: when })
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe('loadBusyIntervals', () => {
  it('filters by account and confirmed status, and builds end times', async () => {
    const { db, ops } = recordingDb(() => ({
      data: [{ scheduled_at: '2026-10-08T18:00:00.000Z', duration_minutes: 60 }],
    }));
    const busy = await loadBusyIntervals(db, 'acc-1', '2026-10-08');
    expect(ops[0].filters).toMatchObject({ account_id: 'acc-1', status: 'confirmed' });
    expect(busy[0].end.toISOString()).toBe('2026-10-08T19:00:00.000Z');
  });
});
