// Cliente REST do Shippo (sem SDK). Docs: https://docs.goshippo.com
import type { Address } from './types'

const API = 'https://api.goshippo.com'

export class ShippoError extends Error {
  constructor(message: string, public messages: string[] = []) {
    super(message)
    this.name = 'ShippoError'
  }
}

export type Rate = { id: string; carrier: string; service: string; amount_cents: number; days: number | null }

export type Parcel = { length: number; width: number; height: number; weight_oz: number }

type ShippoMessage = { text?: string } | string

const messagesOf = (list: unknown): string[] =>
  Array.isArray(list)
    ? (list as ShippoMessage[]).map((m) => (typeof m === 'string' ? m : m?.text ?? '')).filter(Boolean)
    : []

async function call(apiKey: string, path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `ShippoToken ${apiKey}`, 'Content-Type': 'application/json' },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? [data.detail] : messagesOf(data?.messages)
    throw new ShippoError(`Shippo HTTP ${res.status}`, detail)
  }
  return data
}

type RawRate = {
  object_id: string
  amount: string
  provider: string
  servicelevel?: { name?: string; token?: string }
  estimated_days?: number | null
}

const toRate = (r: RawRate): Rate => ({
  id: r.object_id,
  carrier: r.provider,
  service: r.servicelevel?.name ?? r.servicelevel?.token ?? '',
  amount_cents: Math.round(Number(r.amount) * 100),
  days: r.estimated_days ?? null,
})

const toShippoAddress = (a: Address) => ({
  name: a.name,
  street1: a.street1,
  street2: a.street2 ?? '',
  city: a.city,
  state: a.state,
  zip: a.zip,
  country: a.country || 'US',
  phone: a.phone ?? '',
  email: a.email ?? '',
})

export async function getRates(apiKey: string, input: { from: Address; to: Address; parcel: Parcel }): Promise<Rate[]> {
  const data = await call(apiKey, '/shipments/', {
    method: 'POST',
    body: {
      address_from: toShippoAddress(input.from),
      address_to: toShippoAddress(input.to),
      parcels: [{
        length: String(input.parcel.length),
        width: String(input.parcel.width),
        height: String(input.parcel.height),
        distance_unit: 'in',
        weight: String(input.parcel.weight_oz),
        mass_unit: 'oz',
      }],
      async: false,
    },
  })
  const rates = (data?.rates ?? []) as RawRate[]
  if (rates.length === 0) throw new ShippoError('No rates', messagesOf(data?.messages))
  return rates.map(toRate).sort((a, b) => a.amount_cents - b.amount_cents)
}

export async function getRate(apiKey: string, rateId: string): Promise<Rate> {
  return toRate(await call(apiKey, `/rates/${encodeURIComponent(rateId)}`))
}

export async function buyLabel(apiKey: string, rateId: string) {
  const tx = await call(apiKey, '/transactions/', {
    method: 'POST',
    body: { rate: rateId, label_file_type: 'PDF_4x6', async: false },
  })
  if (tx?.status !== 'SUCCESS') throw new ShippoError('Label purchase failed', messagesOf(tx?.messages))
  return {
    transactionId: tx.object_id as string,
    trackingNumber: tx.tracking_number as string,
    trackingUrl: (tx.tracking_url_provider ?? null) as string | null,
    labelUrl: tx.label_url as string,
    eta: (tx.eta ?? null) as string | null,
  }
}

export async function refundLabel(apiKey: string, transactionId: string): Promise<void> {
  await call(apiKey, '/refunds/', { method: 'POST', body: { transaction: transactionId, async: false } })
}
