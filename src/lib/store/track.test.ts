import { describe, expect, it } from 'vitest'
import { parseTrackPayload } from './track'

const ACC = 'acc-store'
const base = { visitor_id: 'v_abc', session_id: 's_123', type: 'page_view', path: '/' }
const headers = (h: Record<string, string> = {}) => new Headers(h)

describe('parseTrackPayload', () => {
  it('maps a page view with source, device and region', () => {
    const r = parseTrackPayload(
      ACC,
      { events: [{ ...base, referrer: 'https://l.instagram.com/?u=x', utm_source: 'ig_bio' }] },
      headers({
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        'x-vercel-ip-country': 'US',
        'x-vercel-ip-country-region': 'MA',
        'x-forwarded-for': '1.2.3.4',
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows[0]).toMatchObject({
      account_id: ACC, visitor_id: 'v_abc', session_id: 's_123', type: 'page_view',
      referrer_source: 'instagram', utm_source: 'ig_bio', device: 'mobile', country: 'US', region: 'MA',
    })
    expect(JSON.stringify(r.rows)).not.toContain('1.2.3.4')
  })

  it('treats no referrer as direct and a desktop UA as desktop', () => {
    const r = parseTrackPayload(ACC, { events: [base] }, headers({ 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' }))
    expect(r.ok && r.rows[0]).toMatchObject({ referrer_source: 'direct', device: 'desktop' })
  })

  it.each([
    ['https://www.google.com/', 'google'],
    ['https://m.facebook.com/', 'facebook'],
    ['https://www.tiktok.com/', 'tiktok'],
    ['https://example.com/', 'other'],
  ])('classifies referrer %s as %s', (referrer, source) => {
    const r = parseTrackPayload(ACC, { events: [{ ...base, referrer }] }, headers())
    expect(r.ok && r.rows[0].referrer_source).toBe(source)
  })

  it('rejects purchase events from the browser', () => {
    expect(parseTrackPayload(ACC, { events: [{ ...base, type: 'purchase' }] }, headers()).ok).toBe(false)
  })

  it('rejects more than 20 events', () => {
    expect(parseTrackPayload(ACC, { events: Array(21).fill(base) }, headers()).ok).toBe(false)
  })

  it('rejects bad ids', () => {
    expect(parseTrackPayload(ACC, { events: [{ ...base, visitor_id: 'x y<script>' }] }, headers()).ok).toBe(false)
    expect(parseTrackPayload(ACC, { events: [{ ...base, session_id: 'a'.repeat(65) }] }, headers()).ok).toBe(false)
  })

  it('drops heartbeats with absurd durations but keeps the rest', () => {
    const r = parseTrackPayload(ACC, {
      events: [{ ...base, type: 'heartbeat', duration_ms: 999999 }, { ...base, type: 'heartbeat', duration_ms: 15000 }],
    }, headers())
    expect(r.ok && r.rows.map((x) => x.duration_ms)).toEqual([15000])
  })

  it('truncates long strings', () => {
    const r = parseTrackPayload(ACC, { events: [{ ...base, type: 'product_view', product_slug: 'a'.repeat(500) }] }, headers())
    expect(r.ok && r.rows[0].product_slug?.length).toBe(200)
  })

  it('rejects a body without events', () => {
    expect(parseTrackPayload(ACC, null, headers()).ok).toBe(false)
    expect(parseTrackPayload(ACC, { events: [] }, headers()).ok).toBe(false)
  })
})
