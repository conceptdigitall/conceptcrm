// Wiring check for the agenda / deals / marketing endpoints: each
// handler asks `requireApiKey` for the right scope, and marketing is
// closed to non-internal accounts even with the scope.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordingDb } from '@/lib/api/v1/recording-db.test-utils';

const mocks = vi.hoisted(() => ({ requireApiKey: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => ({ requireApiKey: mocks.requireApiKey }));
vi.mock('@/lib/calendar/google', () => ({
  createCalendarEvent: vi.fn(),
  getCalendarAvailability: vi.fn(async () => ({
    isWorkingDay: true,
    availableSlots: [{ time: '09:00' }, { time: '10:00' }],
    suggestedSlots: ['09:00'],
  })),
}));

import * as appointments from './appointments/route';
import * as appointment from './appointments/[id]/route';
import * as availability from './availability/route';
import * as pipelines from './pipelines/route';
import * as deals from './deals/route';
import * as deal from './deals/[id]/route';
import * as videos from './marketing/videos/route';
import * as video from './marketing/videos/[id]/route';

const params = { params: Promise.resolve({ id: 'x-1' }) };
const get = (path: string) => new Request(`http://localhost/api/v1/${path}`);
const send = (path: string, method: string, body: unknown) =>
  new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

let ops: ReturnType<typeof recordingDb>['ops'];

function useAccount(
  accountId: string,
  reply: Parameters<typeof recordingDb>[0] = () => ({ data: [] })
) {
  const fake = recordingDb(reply);
  ops = fake.ops;
  mocks.requireApiKey.mockResolvedValue({
    authType: 'api_key',
    supabase: fake.db,
    accountId,
    keyId: 'k-1',
    scopes: [],
    createdBy: 'u-1',
  });
}

beforeEach(() => useAccount('acc-1'));

describe('scope required by each endpoint', () => {
  const cases: Array<[string, () => Promise<Response>, string]> = [
    ['GET appointments', () => appointments.GET(get('appointments')), 'calendar:read'],
    ['POST appointments', () => appointments.POST(send('appointments', 'POST', {})), 'calendar:write'],
    ['GET appointment', () => appointment.GET(get('appointments/x-1'), params), 'calendar:read'],
    ['PATCH appointment', () => appointment.PATCH(send('appointments/x-1', 'PATCH', {}), params), 'calendar:write'],
    ['GET availability', () => availability.GET(get('availability?date=2026-10-08')), 'calendar:read'],
    ['GET pipelines', () => pipelines.GET(get('pipelines')), 'deals:read'],
    ['GET deals', () => deals.GET(get('deals')), 'deals:read'],
    ['POST deals', () => deals.POST(send('deals', 'POST', {})), 'deals:write'],
    ['GET deal', () => deal.GET(get('deals/x-1'), params), 'deals:read'],
    ['PATCH deal', () => deal.PATCH(send('deals/x-1', 'PATCH', {}), params), 'deals:write'],
    ['GET videos', () => videos.GET(get('marketing/videos')), 'marketing:generate'],
    ['POST videos', () => videos.POST(send('marketing/videos', 'POST', {})), 'marketing:generate'],
    ['GET video', () => video.GET(get('marketing/videos/x-1'), params), 'marketing:generate'],
  ];

  it.each(cases)('%s', async (_name, call, scope) => {
    await call();
    expect(mocks.requireApiKey).toHaveBeenCalledWith(expect.any(Request), scope);
  });
});

describe('appointments list', () => {
  it('rejects bad dates and filters by account', async () => {
    expect((await appointments.GET(get('appointments?from=ontem'))).status).toBe(400);
    const res = await appointments.GET(get('appointments?status=confirmed'));
    expect(res.status).toBe(200);
    expect(ops[0].filters).toMatchObject({ account_id: 'acc-1', status: 'confirmed' });
  });
});

describe('availability', () => {
  it('requires YYYY-MM-DD and returns slot times', async () => {
    expect((await availability.GET(get('availability?date=8/10'))).status).toBe(400);
    const res = await availability.GET(get('availability?date=2026-10-08'));
    expect((await res.json()).data.available_slots).toEqual(['09:00', '10:00']);
  });
});

describe('marketing videos', () => {
  it('403s for a non-internal account even with the scope', async () => {
    useAccount('acc-outsider');
    const res = await videos.POST(send('marketing/videos', 'POST', { prompt: 'Promo' }));
    expect(res.status).toBe(403);
    expect(ops).toHaveLength(0);
  });

  it('queues a pending video for the internal account', async () => {
    useAccount('acc-1', () => ({ data: { id: 'v-1', prompt: 'Promo', status: 'pending' }, count: 0 }));
    const res = await videos.POST(send('marketing/videos', 'POST', { prompt: 'Promo' }));
    expect(res.status).toBe(201);
    const insert = ops.find((o) => o.action === 'insert');
    expect(insert?.payload).toMatchObject({ account_id: 'acc-1', created_by: 'u-1', status: 'pending' });
  });

  it('returns a signed download url only when done', async () => {
    useAccount('acc-1', () => ({
      data: { id: 'x-1', prompt: 'Promo', status: 'done', video_path: 'a/b.mp4', created_at: '2026-10-05T00:00:00Z' },
    }));
    const body = await (await video.GET(get('marketing/videos/x-1'), params)).json();
    expect(body.data.download_url).toBe('https://signed.example/video.mp4');
    expect(ops[0].filters).toEqual({ id: 'x-1', account_id: 'acc-1' });
  });
});
