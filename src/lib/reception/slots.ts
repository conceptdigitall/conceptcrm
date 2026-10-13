import type { SupabaseClient } from '@supabase/supabase-js'
import type { AvailableSlot } from '@/lib/calendar/rules'
import { getCalendarAvailability } from '@/lib/calendar/google'
import { loadBusyIntervals } from '@/lib/calendar/appointments'
import type { OfferedSlot } from './types'

const TZ = 'America/Sao_Paulo'
const MIN_LEAD_MS = 2 * 60 * 60 * 1000
const BUSINESS_DAYS = 5
const OFFER_COUNT = 3
const MAX_SCAN_DAYS = 14

function saoPauloDateStr(d: Date): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function isWeekday(dateStr: string): boolean {
  const dow = new Date(`${dateStr}T12:00:00-03:00`).getUTCDay()
  return dow >= 1 && dow <= 5
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00-03:00`)
  d.setUTCDate(d.getUTCDate() + n)
  return saoPauloDateStr(d)
}

function saoPauloHour(d: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d)
  return Number(h) % 24
}

export function slotLabel(d: Date): string {
  const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short' })
    .format(d)
    .replace(/\.$/, '')
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value) % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  const time = minute === 0 ? `${hour}h` : `${hour}h${String(minute).padStart(2, '0')}`
  return `${weekday}, ${date} às ${time}`
}

function toOffered(s: AvailableSlot): OfferedSlot {
  return { iso: s.iso, label: slotLabel(s.dateObj) }
}

export async function pickOfferSlots(
  now: Date,
  loadDay: (dateStr: string) => Promise<AvailableSlot[]>,
  skip: string[] = []
): Promise<OfferedSlot[]> {
  const earliest = now.getTime() + MIN_LEAD_MS
  const skipSet = new Set(skip)

  const dates: string[] = []
  let cursor = saoPauloDateStr(now)
  for (let i = 0; i < MAX_SCAN_DAYS && dates.length < BUSINESS_DAYS; i++, cursor = addDays(cursor, 1)) {
    if (isWeekday(cursor)) dates.push(cursor)
  }
  // All days at once (the webhook has 60 s); the order of `dates` keeps the same selection.
  const loaded = await Promise.all(dates.map((d) => loadDay(d)))
  const days: AvailableSlot[][] = loaded
    .map((slots) =>
      slots
        .filter((s) => s.dateObj.getTime() >= earliest && !skipSet.has(s.iso))
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime()),
    )
    .filter((slots) => slots.length > 0)

  const picked: AvailableSlot[] = []
  const first = days[0]
  if (first) picked.push(first[0])
  const second = days[1]
  if (second) picked.push(second.find((s) => saoPauloHour(s.dateObj) >= 13) ?? second[0])
  const third = days[2]
  if (third) picked.push(third[0])

  if (picked.length < OFFER_COUNT) {
    const chosen = new Set(picked.map((s) => s.iso))
    const usedDays = days.slice(0, picked.length)
    for (const day of usedDays) {
      for (const s of day) {
        if (picked.length >= OFFER_COUNT) break
        if (!chosen.has(s.iso)) {
          picked.push(s)
          chosen.add(s.iso)
        }
      }
    }
  }

  return picked
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
    .slice(0, OFFER_COUNT)
    .map(toOffered)
}

/** The chosen slot is still ≥ 2h ahead and still free in the agenda (it may have been offered hours ago). */
export async function isSlotStillFree(
  now: Date,
  loadDay: (dateStr: string) => Promise<AvailableSlot[]>,
  iso: string
): Promise<boolean> {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() + MIN_LEAD_MS) return false
  const day = await loadDay(saoPauloDateStr(at))
  return day.some((s) => s.iso === iso)
}

export function makeLoadDay(
  db: SupabaseClient,
  accountId: string,
  now: Date
): (dateStr: string) => Promise<AvailableSlot[]> {
  return async (dateStr: string) => {
    const existingBusyIntervals = await loadBusyIntervals(db, accountId, dateStr)
    const targetDate = new Date(`${dateStr}T12:00:00-03:00`)
    const res = await getCalendarAvailability({ targetDate, existingBusyIntervals, now })
    return res.availableSlots
  }
}
