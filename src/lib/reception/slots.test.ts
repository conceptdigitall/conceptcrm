import { describe, it, expect } from 'vitest'
import type { AvailableSlot } from '@/lib/calendar/rules'
import { pickOfferSlots, slotLabel } from './slots'

const NOW = new Date('2026-10-13T08:00:00-03:00') // terça

function slot(dateStr: string, time: string): AvailableSlot {
  const dateObj = new Date(`${dateStr}T${time}:00-03:00`)
  return { time, iso: dateObj.toISOString(), dateObj }
}

function fakeLoadDay(map: Record<string, string[]>) {
  return async (dateStr: string) => (map[dateStr] ?? []).map((t) => slot(dateStr, t))
}

describe('pickOfferSlots', () => {
  it('nunca oferece sábado nem domingo', async () => {
    const load = fakeLoadDay({
      '2026-10-17': ['09:00', '10:00', '11:00'], // sábado
      '2026-10-18': ['09:00'], // domingo
      '2026-10-19': ['09:00', '14:00'], // segunda
    })
    const out = await pickOfferSlots(NOW, load)
    expect(out.map((s) => s.iso)).toEqual([slot('2026-10-19', '09:00').iso, slot('2026-10-19', '14:00').iso])
  })

  it('descarta slot a menos de 2h de now', async () => {
    const load = fakeLoadDay({ '2026-10-13': ['09:00', '10:00'], '2026-10-14': ['09:00'] })
    const out = await pickOfferSlots(NOW, load)
    expect(out[0].iso).toBe(slot('2026-10-13', '10:00').iso)
  })

  it('2º dia prefere a tarde', async () => {
    const load = fakeLoadDay({
      '2026-10-13': ['10:00'],
      '2026-10-14': ['09:00', '13:00', '15:00'],
      '2026-10-15': ['09:00'],
    })
    const out = await pickOfferSlots(NOW, load)
    expect(out.map((s) => s.iso)).toEqual([
      slot('2026-10-13', '10:00').iso,
      slot('2026-10-14', '13:00').iso,
      slot('2026-10-15', '09:00').iso,
    ])
  })

  it('2º dia sem tarde usa o 1º do dia', async () => {
    const load = fakeLoadDay({
      '2026-10-13': ['10:00'],
      '2026-10-14': ['09:00', '11:00'],
      '2026-10-15': ['09:00'],
    })
    const out = await pickOfferSlots(NOW, load)
    expect(out[1].iso).toBe(slot('2026-10-14', '09:00').iso)
  })

  it('só 1 dia com vaga devolve 3 horários desse dia', async () => {
    const load = fakeLoadDay({ '2026-10-15': ['09:00', '09:30', '10:00', '10:30'] })
    const out = await pickOfferSlots(NOW, load)
    expect(out.map((s) => s.iso)).toEqual([
      slot('2026-10-15', '09:00').iso,
      slot('2026-10-15', '09:30').iso,
      slot('2026-10-15', '10:00').iso,
    ])
  })

  it('sem vagas devolve []', async () => {
    expect(await pickOfferSlots(NOW, fakeLoadDay({}))).toEqual([])
  })

  it('skip remove os já oferecidos', async () => {
    const load = fakeLoadDay({ '2026-10-13': ['10:00', '11:00'] })
    const out = await pickOfferSlots(NOW, load, [slot('2026-10-13', '10:00').iso])
    expect(out.map((s) => s.iso)).toEqual([slot('2026-10-13', '11:00').iso])
  })

  it('devolve em ordem cronológica com label', async () => {
    const load = fakeLoadDay({ '2026-10-14': ['10:00'] })
    const out = await pickOfferSlots(NOW, load)
    expect(out[0].label).toBe('qua, 14/10 às 10h')
  })
})

describe('slotLabel', () => {
  it('formata dia da semana, data e hora', () => {
    expect(slotLabel(new Date('2026-10-14T13:00:00Z'))).toBe('qua, 14/10 às 10h')
  })
  it('minutos diferentes de zero viram 10h30', () => {
    expect(slotLabel(new Date('2026-10-14T13:30:00Z'))).toBe('qua, 14/10 às 10h30')
  })
})

describe('pickOfferSlots em paralelo', () => {
  it('carrega os dias ao mesmo tempo e mantém a mesma seleção', async () => {
    const map: Record<string, string[]> = {
      '2026-10-13': ['10:00'],
      '2026-10-14': ['09:00', '13:00', '15:00'],
      '2026-10-15': ['09:00'],
    }
    const sequential = await pickOfferSlots(NOW, fakeLoadDay(map))
    let inFlight = 0
    let maxInFlight = 0
    const slow = async (d: string) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return fakeLoadDay(map)(d)
    }
    const parallel = await pickOfferSlots(NOW, slow)
    expect(maxInFlight).toBe(5)
    expect(parallel).toEqual(sequential)
  })
})
