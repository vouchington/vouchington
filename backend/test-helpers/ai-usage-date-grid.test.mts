import { describe, expect, it } from 'vitest'
import { AI_USAGE_PARTITION_TABLES } from '../data-stores/psql/config-driven/utils/partition-config-monthly.mts'
import {
  AI_USAGE_DAY_MS,
  AI_USAGE_SLOT_MS,
  getTestAiUsageSlotGridForDate,
  getTestAiUsageReservationMonths,
} from './ai-usage-date-grid.mts'

const dates = [
  '2026-11-12T07:08:00Z',
  '2026-03-01T00:00:00Z',
  '2028-03-01T00:00:00Z',
  '2026-12-31T23:59:59Z',
  '2027-01-01T00:00:00Z',
]

describe('AI usage date reservation capacity', () => {
  it('rejects invalid reference and minimum dates', () => {
    expect(() => getTestAiUsageSlotGridForDate(new Date(Number.NaN))).toThrow(TypeError)
    expect(() =>
      getTestAiUsageSlotGridForDate(new Date(), { notBefore: new Date(Number.NaN) }),
    ).toThrow(TypeError)
  })

  it.each(dates)('keeps all 25 candidates safely before %s', value => {
    const now = new Date(value)
    const { ordinarySlots, controlSlot } = getTestAiUsageSlotGridForDate(now)
    expect(ordinarySlots).toHaveLength(25)
    expect(new Set(ordinarySlots).size).toBe(25)
    expect(ordinarySlots).not.toContain(controlSlot)
    const liveWindowStart =
      Math.floor(now.getTime() / AI_USAGE_DAY_MS) * AI_USAGE_DAY_MS - AI_USAGE_DAY_MS
    for (const slot of [...ordinarySlots, controlSlot]) {
      expect((slot + 1) * AI_USAGE_SLOT_MS).toBeLessThanOrEqual(liveWindowStart)
      const retentionDays = AI_USAGE_PARTITION_TABLES[0]!.retentionDays!
      expect(slot * AI_USAGE_SLOT_MS).toBeGreaterThan(
        now.getTime() - retentionDays * AI_USAGE_DAY_MS,
      )
    }
  })

  it.each(dates)('honors future noon and live-window bounds from %s', value => {
    const now = new Date(value)
    const notBefore = new Date(now.getTime() + 10 * AI_USAGE_DAY_MS)
    const grid = getTestAiUsageSlotGridForDate(now, { notBefore })
    expect(grid.ordinarySlots).toHaveLength(25)
    for (const slot of grid.ordinarySlots) {
      expect(slot * AI_USAGE_SLOT_MS).toBeGreaterThanOrEqual(now.getTime() + AI_USAGE_DAY_MS)
      expect(slot * AI_USAGE_SLOT_MS + 1.5 * AI_USAGE_DAY_MS).toBeGreaterThanOrEqual(
        notBefore.getTime(),
      )
    }
  })

  it.each(['11:59:59.999Z', '12:00:00.000Z', '12:00:00.001Z', '23:59:59.999Z'])(
    'honors the minimum instant around noon and UTC rollover at %s',
    time => {
      const now = new Date('2026-11-12T07:08:00Z')
      const notBefore = new Date(`2026-12-03T${time}`)
      const { ordinarySlots } = getTestAiUsageSlotGridForDate(now, { notBefore })
      expect(ordinarySlots).toHaveLength(25)
      for (const slot of ordinarySlots) {
        expect(
          new Date(slot * AI_USAGE_SLOT_MS + 1.5 * AI_USAGE_DAY_MS).getTime(),
        ).toBeGreaterThanOrEqual(notBefore.getTime())
      }
    },
  )

  it('keeps ownership and control identities disjoint across clocks and modes', () => {
    const grids = dates.flatMap(value => {
      const now = new Date(value)
      return [
        getTestAiUsageSlotGridForDate(now),
        getTestAiUsageSlotGridForDate(now, { notBefore: now }),
      ]
    })
    for (const grid of grids) {
      for (const other of grids) expect(grid.ordinarySlots).not.toContain(other.controlSlot)
    }
    const before = getTestAiUsageSlotGridForDate(new Date('2026-10-31T23:59:59Z'))
    const after = getTestAiUsageSlotGridForDate(new Date('2026-11-01T00:00:00Z'))
    expect(
      before.ordinarySlots.filter(slot => after.ordinarySlots.includes(slot)).length,
    ).toBeGreaterThan(20)
  })

  it.each(dates)('prepares every month touched by owned blocks around %s', value => {
    const now = new Date(value)
    const { ordinarySlots, controlSlot } = getTestAiUsageSlotGridForDate(now)
    const months = getTestAiUsageReservationMonths(now).map(date => date.toISOString().slice(0, 7))
    const forward = getTestAiUsageSlotGridForDate(now, { notBefore: now }).ordinarySlots
    expect(forward).toHaveLength(25)
    for (const slots of [[...ordinarySlots, controlSlot], forward]) {
      const touchedMonths = new Set<string>()
      for (const slot of slots) {
        for (let day = 0; day < 3; day++) {
          const ownedDay = new Date(slot * AI_USAGE_SLOT_MS + day * AI_USAGE_DAY_MS)
          const month = ownedDay.toISOString().slice(0, 7)
          touchedMonths.add(month)
          expect(months).toContain(month)
        }
      }
      expect(touchedMonths.size).toBeLessThanOrEqual(4)
    }
  })
})
