import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buyLabel, getRate, getRates, refundLabel, ShippoError } from './shippo'

const addr = { name: 'A', street1: '1 Main', city: 'Boston', state: 'MA', zip: '02101', country: 'US' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('shippo client', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('quotes rates sorted by price with the token header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      rates: [
        { object_id: 'r_ups', amount: '9.10', provider: 'UPS', servicelevel: { name: 'Ground' }, estimated_days: 3 },
        { object_id: 'r_usps', amount: '5.25', provider: 'USPS', servicelevel: { name: 'Ground Advantage' }, estimated_days: 4 },
      ],
      messages: [],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rates = await getRates('shippo_test_1', { from: addr, to: addr, parcel: { length: 10, width: 8, height: 2, weight_oz: 14 } })
    expect(rates).toEqual([
      { id: 'r_usps', carrier: 'USPS', service: 'Ground Advantage', amount_cents: 525, days: 4 },
      { id: 'r_ups', carrier: 'UPS', service: 'Ground', amount_cents: 910, days: 3 },
    ])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.goshippo.com/shipments/')
    expect(init.headers.Authorization).toBe('ShippoToken shippo_test_1')
    const body = JSON.parse(init.body)
    expect(body.async).toBe(false)
    expect(body.parcels[0]).toMatchObject({ weight: '14', mass_unit: 'oz', distance_unit: 'in' })
  })

  it('buys a 4x6 PDF label', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      object_id: 'tx_1', status: 'SUCCESS', tracking_number: '9400', tracking_url_provider: 'https://t.test/9400',
      label_url: 'https://l.test/1.pdf', eta: '2026-11-12T00:00:00Z', messages: [],
    }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await buyLabel('k', 'r_usps')).toEqual({
      transactionId: 'tx_1', trackingNumber: '9400', trackingUrl: 'https://t.test/9400',
      labelUrl: 'https://l.test/1.pdf', eta: '2026-11-12T00:00:00Z',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ rate: 'r_usps', label_file_type: 'PDF_4x6', async: false })
  })

  it('throws ShippoError with the carrier messages when the label fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ status: 'ERROR', messages: [{ text: 'Address not found' }] })))
    await expect(buyLabel('k', 'r')).rejects.toBeInstanceOf(ShippoError)
    await expect(buyLabel('k', 'r')).rejects.toMatchObject({ messages: ['Address not found'] })
  })

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Invalid token' }, 401)))
    await expect(getRates('bad', { from: addr, to: addr, parcel: { length: 1, width: 1, height: 1, weight_oz: 1 } }))
      .rejects.toBeInstanceOf(ShippoError)
  })

  it('reads a single rate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ object_id: 'r_usps', amount: '5.25', provider: 'USPS', servicelevel: { name: 'Ground Advantage' }, estimated_days: 4 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getRate('k', 'r_usps')).toEqual({ id: 'r_usps', carrier: 'USPS', service: 'Ground Advantage', amount_cents: 525, days: 4 })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.goshippo.com/rates/r_usps')
  })

  it('requests a label refund', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ status: 'QUEUED' }))
    vi.stubGlobal('fetch', fetchMock)
    await refundLabel('k', 'tx_1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.goshippo.com/refunds/')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ transaction: 'tx_1', async: false })
  })
})
