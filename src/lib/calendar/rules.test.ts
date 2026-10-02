import { describe, it, expect } from 'vitest';
import {
  isWorkingDay,
  calculateAvailableSlots,
  pickSuggestedSlots,
  formatSlotsForWhatsApp,
} from './rules';

describe('calendar rules & availability', () => {
  describe('isWorkingDay', () => {
    it('returns true for Monday to Saturday', () => {
      // 2026-10-05 is Monday
      expect(isWorkingDay(new Date('2026-10-05T12:00:00-03:00'))).toBe(true);
      // 2026-10-10 is Saturday
      expect(isWorkingDay(new Date('2026-10-10T12:00:00-03:00'))).toBe(true);
    });

    it('returns false for Sunday', () => {
      // 2026-10-04 is Sunday
      expect(isWorkingDay(new Date('2026-10-04T12:00:00-03:00'))).toBe(false);
    });
  });

  describe('calculateAvailableSlots', () => {
    it('returns empty array on Sunday', () => {
      const sunday = new Date('2026-10-04T00:00:00-03:00');
      const slots = calculateAvailableSlots({
        targetDate: sunday,
        busyIntervals: [],
        now: new Date('2026-10-01T08:00:00-03:00'),
      });
      expect(slots).toEqual([]);
    });

    it('generates 30-min slots from 09:00 to 18:00 excluding lunch (12:00-13:00)', () => {
      // Future Monday
      const monday = new Date('2026-10-12T00:00:00-03:00');
      const slots = calculateAvailableSlots({
        targetDate: monday,
        durationMinutes: 30,
        busyIntervals: [],
        now: new Date('2026-10-01T08:00:00-03:00'),
      });

      // Expected morning: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30 (6 slots)
      // Lunch: 12:00-13:00 excluded
      // Expected afternoon: 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30 (10 slots)
      // Total: 16 slots
      expect(slots.length).toBe(16);
      expect(slots[0].time).toBe('09:00');
      expect(slots[5].time).toBe('11:30');
      expect(slots[6].time).toBe('13:00');
      expect(slots[slots.length - 1].time).toBe('17:30');
      expect(slots.some((s) => s.time === '12:00' || s.time === '12:30')).toBe(false);
    });

    it('filters out busy intervals from Google Calendar / appointments', () => {
      const targetDay = new Date('2026-10-12T00:00:00-03:00');
      // Busy from 10:00 to 11:00 and 15:00 to 16:00
      const busyIntervals = [
        {
          start: new Date('2026-10-12T10:00:00-03:00'),
          end: new Date('2026-10-12T11:00:00-03:00'),
        },
        {
          start: new Date('2026-10-12T15:00:00-03:00'),
          end: new Date('2026-10-12T15:45:00-03:00'),
        },
      ];

      const slots = calculateAvailableSlots({
        targetDate: targetDay,
        durationMinutes: 30,
        busyIntervals,
        now: new Date('2026-10-01T08:00:00-03:00'),
      });

      const times = slots.map((s) => s.time);
      // 10:00 and 10:30 should be blocked
      expect(times.includes('10:00')).toBe(false);
      expect(times.includes('10:30')).toBe(false);
      // 15:00 and 15:30 should be blocked
      expect(times.includes('15:00')).toBe(false);
      expect(times.includes('15:30')).toBe(false);
      // 09:30, 11:00, 14:30 and 16:00 should remain
      expect(times.includes('09:30')).toBe(true);
      expect(times.includes('11:00')).toBe(true);
      expect(times.includes('14:30')).toBe(true);
      expect(times.includes('16:00')).toBe(true);
    });

    it('filters out slots that have already passed if targetDate is today', () => {
      const today = new Date('2026-10-01T00:00:00-03:00');
      const now = new Date('2026-10-01T14:15:00-03:00'); // 14:15

      const slots = calculateAvailableSlots({
        targetDate: today,
        durationMinutes: 30,
        busyIntervals: [],
        now,
      });

      const times = slots.map((s) => s.time);
      // Slots before 14:15 must be excluded
      expect(times.includes('09:00')).toBe(false);
      expect(times.includes('11:00')).toBe(false);
      expect(times.includes('14:00')).toBe(false);
      // Future slots should be present (with buffer)
      expect(times.includes('15:00')).toBe(true);
      expect(times.includes('16:30')).toBe(true);
    });

    it('supports 60-min meetings', () => {
      const targetDay = new Date('2026-10-12T00:00:00-03:00');
      const slots = calculateAvailableSlots({
        targetDate: targetDay,
        durationMinutes: 60,
        busyIntervals: [],
        now: new Date('2026-10-01T08:00:00-03:00'),
      });

      // Morning: 09:00, 10:00, 11:00 (ends 12:00)
      // Afternoon: 13:00, 14:00, 15:00, 16:00, 17:00 (ends 18:00)
      const times = slots.map((s) => s.time);
      expect(times).toEqual(['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
    });
  });

  describe('pickSuggestedSlots', () => {
    it('picks up to 3 well-distributed slots', () => {
      const allSlots = ['09:00', '09:30', '10:30', '11:00', '13:30', '14:00', '15:30', '16:30', '17:00'];
      const suggested = pickSuggestedSlots(allSlots, 3);
      expect(suggested.length).toBe(3);
      // Should include one early, one middle, one later
      expect(suggested[0]).toBe('09:00');
      expect(suggested[1]).toBe('13:30');
      expect(suggested[2]).toBe('17:00');
    });

    it('returns all slots if total is <= 3', () => {
      const fewSlots = ['10:00', '15:00'];
      expect(pickSuggestedSlots(fewSlots, 3)).toEqual(['10:00', '15:00']);
    });
  });

  describe('formatSlotsForWhatsApp', () => {
    it('formats 3 slots smoothly in Portuguese without markdown asterisks', () => {
      const formatted = formatSlotsForWhatsApp(['10:00', '14:30', '16:00']);
      expect(formatted).toBe('às 10h, às 14h30 e às 16h');
    });

    it('formats 1 slot smoothly', () => {
      const formatted = formatSlotsForWhatsApp(['15:00']);
      expect(formatted).toBe('às 15h');
    });

    it('formats 2 slots smoothly', () => {
      const formatted = formatSlotsForWhatsApp(['10:00', '14:00']);
      expect(formatted).toBe('às 10h e às 14h');
    });

    it('handles empty list gracefully', () => {
      expect(formatSlotsForWhatsApp([])).toBe('nenhum horário disponível');
    });
  });
});
