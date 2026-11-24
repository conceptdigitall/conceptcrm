import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRateCache, getRateToBrl, parseAwesomeDaily, parseAwesomeLatest, parseFrankfurter, RateUnavailableError } from './rates';

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const NOW = new Date('2026-11-20T15:00:00Z');

beforeEach(() => clearRateCache());

describe('parsers', () => {
  it('lê a cotação atual da AwesomeAPI', () => {
    const q = parseAwesomeLatest({ USDBRL: { bid: '5.9346', create_date: '2026-11-19 18:08:12' } }, 'USD');
    expect(q).toEqual({ currency: 'USD', rate: 5.9346, source: 'awesomeapi', date: '2026-11-19' });
    expect(parseAwesomeLatest({}, 'USD')).toBeNull();
    expect(parseAwesomeLatest({ USDBRL: { bid: '0', create_date: 'x' } }, 'USD')).toBeNull();
  });

  it('pega o último dia útil até a data pedida', () => {
    const rows = [
      { bid: '5.20', timestamp: String(Date.parse('2026-03-09T20:00:00Z') / 1000) },
      { bid: '5.16', timestamp: String(Date.parse('2026-03-10T20:00:00Z') / 1000) },
      { bid: '5.30', timestamp: String(Date.parse('2026-03-12T20:00:00Z') / 1000) },
    ];
    expect(parseAwesomeDaily(rows, 'USD', '2026-03-11')).toEqual({ currency: 'USD', rate: 5.16, source: 'awesomeapi', date: '2026-03-10' });
    expect(parseAwesomeDaily([], 'USD', '2026-03-11')).toBeNull();
  });

  it('lê a Frankfurter', () => {
    expect(parseFrankfurter({ date: '2026-03-10', rates: { BRL: 5.1779 } }, 'USD')).toEqual({
      currency: 'USD', rate: 5.1779, source: 'frankfurter', date: '2026-03-10',
    });
  });
});

describe('getRateToBrl', () => {
  it('real é sempre 1, sem rede', async () => {
    const f = vi.fn();
    await expect(getRateToBrl('BRL', null, f, NOW)).resolves.toMatchObject({ rate: 1, source: 'fixed' });
    expect(f).not.toHaveBeenCalled();
  });

  it('usa a reserva quando a principal falha e guarda em cache', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('awesomeapi') ? json(null, false) : json({ date: '2026-11-20', rates: { BRL: 5.9 } }),
    );
    const q = await getRateToBrl('USD', null, f, NOW);
    expect(q).toMatchObject({ rate: 5.9, source: 'frankfurter' });
    await getRateToBrl('USD', null, f, NOW);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('data passada pede histórico; hoje pede a atual', async () => {
    const f = vi.fn<(url: string) => Promise<Response>>(async () => json({ USDBRL: { bid: '5.93', create_date: '2026-11-20 10:00:00' } }));
    await getRateToBrl('USD', '2026-11-20', f, NOW);
    expect(f.mock.calls[0][0]).toContain('/last/USD-BRL');
    const g = vi.fn<(url: string) => Promise<Response>>(async () => json([{ bid: '5.16', timestamp: String(Date.parse('2026-03-10T20:00:00Z') / 1000) }]));
    await getRateToBrl('USD', '2026-03-10', g, NOW);
    expect(g.mock.calls[0][0]).toContain('/daily/USD-BRL/15?start_date=20260303&end_date=20260310');
  });

  it('lança quando as duas fontes falham', async () => {
    const f = vi.fn(async () => json(null, false));
    await expect(getRateToBrl('EUR', null, f, NOW)).rejects.toBeInstanceOf(RateUnavailableError);
  });
});
