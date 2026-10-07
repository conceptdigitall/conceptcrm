import { describe, it, expect } from 'vitest';
import {
  filterReactivationCandidates,
  CandidateContact,
} from './reactivation';

describe('reactivation radar engine', () => {
  const refDate = new Date('2026-10-07T12:00:00Z');

  const createContact = (
    id: string,
    name: string,
    phone: string,
    daysAgoActivity: number | null,
    futureAppointments: Array<{ id: string; start_time: string; status: string }> = []
  ): CandidateContact => {
    let lastActivity: string | null = null;
    if (daysAgoActivity !== null) {
      const d = new Date(refDate.getTime() - daysAgoActivity * 24 * 60 * 60 * 1000);
      lastActivity = d.toISOString();
    }
    return {
      id,
      name,
      phone,
      last_interaction_at: lastActivity,
      last_appointment_at: lastActivity,
      appointments: futureAppointments,
    };
  };

  it('filters contacts who reached niche threshold (e.g. barber: 21 days)', () => {
    const contacts: CandidateContact[] = [
      createContact('1', 'Lucas (25 dias)', '+5513988881111', 25),
      createContact('2', 'Matheus (15 dias)', '+5513988882222', 15),
      createContact('3', 'Pedro (35 dias)', '+5513988883333', 35),
      createContact('4', 'Sem data', '+5513988884444', null),
    ];

    const results = filterReactivationCandidates(contacts, {
      niche: 'barbeiro',
      referenceDate: refDate,
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.contact.id)).toEqual(['3', '1']); // Sorted by days inactive desc
  });

  it('strictly excludes contacts with recent activity in the last 7 days', () => {
    const contacts: CandidateContact[] = [
      createContact('1', 'Recente (3 dias)', '+5513988881111', 3),
      createContact('2', 'Inativo (22 dias)', '+5513988882222', 22),
    ];

    const results = filterReactivationCandidates(contacts, {
      niche: 'barbeiro',
      referenceDate: refDate,
    });

    expect(results).toHaveLength(1);
    expect(results[0].contact.id).toBe('2');
  });

  it('strictly excludes contacts with future confirmed or scheduled appointments (Socratic Gate A2)', () => {
    const futureDate = new Date(refDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const contacts: CandidateContact[] = [
      createContact('1', 'Inativo mas com agendamento futuro', '+5513988881111', 30, [
        { id: 'app-1', start_time: futureDate, status: 'confirmed' },
      ]),
      createContact('2', 'Inativo sem agendamento futuro', '+5513988882222', 30, []),
      createContact('3', 'Inativo com agendamento cancelado', '+5513988883333', 30, [
        { id: 'app-2', start_time: futureDate, status: 'cancelled' },
      ]),
    ];

    const results = filterReactivationCandidates(contacts, {
      niche: 'barbeiro',
      referenceDate: refDate,
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.contact.id)).toEqual(['2', '3']);
  });

  it('classifies urgency temperatures correctly', () => {
    // For barber, threshold = 21:
    // No ciclo: 21 to < 31.5 (e.g. 25 days)
    // Atrasado: 31.5 to < 52.5 (e.g. 40 days)
    // Crítico: >= 52.5 (e.g. 60 days)
    const contacts: CandidateContact[] = [
      createContact('1', 'No ciclo', '+5513988881111', 25),
      createContact('2', 'Atrasado', '+5513988882222', 40),
      createContact('3', 'Crítico', '+5513988883333', 60),
    ];

    const results = filterReactivationCandidates(contacts, {
      niche: 'barbeiro',
      referenceDate: refDate,
    });

    const byId = Object.fromEntries(results.map((r) => [r.contact.id, r]));
    expect(byId['1'].urgency).toBe('no_ciclo');
    expect(byId['1'].urgencyLabel).toBe('No momento ideal');
    expect(byId['2'].urgency).toBe('atrasado');
    expect(byId['2'].urgencyLabel).toBe('Atrasado');
    expect(byId['3'].urgency).toBe('critico');
    expect(byId['3'].urgencyLabel).toBe('Crítico / Sumido');
  });

  it('allows custom thresholdDays override', () => {
    const contacts: CandidateContact[] = [
      createContact('1', '10 dias', '+5513988881111', 10),
      createContact('2', '5 dias', '+5513988882222', 5),
    ];

    const results = filterReactivationCandidates(contacts, {
      niche: 'barbeiro',
      thresholdDays: 8,
      referenceDate: refDate,
    });

    expect(results).toHaveLength(1);
    expect(results[0].contact.id).toBe('1');
  });
});
