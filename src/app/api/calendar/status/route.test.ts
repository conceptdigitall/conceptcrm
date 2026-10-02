import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('GET /api/calendar/status', () => {
  it('returns current calendar configuration status', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.mode).toBeDefined();
    expect(json.businessHours).toBeDefined();
    expect(json.businessHours.workingDaysText).toContain('Segunda a Sábado');
  });
});
