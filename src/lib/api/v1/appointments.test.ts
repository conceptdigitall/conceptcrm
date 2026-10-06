import { describe, it, expect } from 'vitest';

import { recordingDb } from './recording-db.test-utils';
import {
  appointmentErrorResponse,
  buildAppointmentPatch,
  serializeAppointment,
  updateAppointment,
} from './appointments';
import { AppointmentError } from '@/lib/calendar/appointments';

describe('buildAppointmentPatch', () => {
  it('whitelists fields and stamps updated_at', () => {
    const patch = buildAppointmentPatch({
      status: 'cancelled',
      notes: 'cliente pediu',
      account_id: 'other-account', // ignored
    });
    expect(patch).toMatchObject({ status: 'cancelled', notes: 'cliente pediu' });
    expect(patch).not.toHaveProperty('account_id');
    expect(typeof patch.updated_at).toBe('string');
  });

  it('validates status, title and rescheduling rules', () => {
    expect(() => buildAppointmentPatch({ status: 'deleted' })).toThrow('status');
    expect(() => buildAppointmentPatch({ title: '  ' })).toThrow('title');
    expect(() => buildAppointmentPatch({ scheduled_at: '2026-10-11T12:00:00-03:00' })).toThrow(
      'domingos'
    );
  });

  it('refuses an empty patch', () => {
    expect(() => buildAppointmentPatch({})).toThrow('Nothing to update');
  });
});

describe('updateAppointment', () => {
  it('filters the update by account and 404s when nothing matched', async () => {
    const { db, ops } = recordingDb(() => ({ data: null }));
    await expect(
      updateAppointment(db, 'acc-1', 'ap-9', { status: 'completed' })
    ).rejects.toMatchObject({ status: 404 });
    expect(ops[0]).toMatchObject({
      table: 'appointments',
      action: 'update',
      filters: { id: 'ap-9', account_id: 'acc-1' },
    });
  });
});

describe('serializeAppointment', () => {
  it('flattens the embedded contact', () => {
    const out = serializeAppointment({
      id: 'ap-1',
      contact_id: 'c-1',
      contact: { id: 'c-1', name: null, phone: '+5513999999999' },
      title: 'Demo',
      scheduled_at: '2026-10-08T18:00:00Z',
      duration_minutes: 30,
      status: 'confirmed',
      created_at: '2026-10-05T00:00:00Z',
    });
    expect(out.contact).toEqual({ id: 'c-1', name: null, phone: '+5513999999999' });
    expect(out.meeting_url).toBeNull();
  });
});

describe('appointmentErrorResponse', () => {
  it('never leaks 5xx messages', async () => {
    const res = appointmentErrorResponse(new AppointmentError('Erro ao gravar: senha do db', 500));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('senha');
  });

  it('keeps 4xx messages and codes', async () => {
    const res = appointmentErrorResponse(new AppointmentError('Contato não encontrado', 404));
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Contato não encontrado' },
    });
  });
});
