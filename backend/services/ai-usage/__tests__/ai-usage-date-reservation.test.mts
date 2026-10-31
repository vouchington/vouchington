import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { acquireTestAiUsageDateReservation, insertTestAiUsageRecord } from '@voucha/test-helpers'
import { createAuthenticatedTestSession } from '@voucha/test-helpers/authenticated-session'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import {
  acquireTestAiUsageDateReservationControlSlot,
  getTestAiUsageSlotGridForDate,
} from '@voucha/test-helpers/entities/ai-usage-date-reservation'
import {
  getDailyAiCostTotalMicrounits,
  refreshDailyAiCostTotalMicrounits,
} from '../daily-total.mts'

describe('acquireTestAiUsageDateReservation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses stable absolute slot identities across adjacent process start months', () => {
    const earlier = getTestAiUsageSlotGridForDate(new Date('2026-10-31T23:59:00Z'))
    const later = getTestAiUsageSlotGridForDate(new Date('2026-11-01T00:01:00Z'))
    expect(
      earlier.ordinarySlots.filter(slot => later.ordinarySlots.includes(slot)).length,
    ).toBeGreaterThan(0)
    expect(earlier.ordinarySlots).not.toContain(later.controlSlot)
    expect(later.ordinarySlots).not.toContain(earlier.controlSlot)
  })

  it('recycles released slots after more than two full ordinary pools', async () => {
    const poolSize = getTestAiUsageSlotGridForDate(new Date()).ordinarySlots.length
    const days = new Set<string>()
    for (let attempt = 0; attempt < poolSize * 2 + 1; attempt++) {
      const reservation = await acquireTestAiUsageDateReservation()
      try {
        days.add(reservation.day)
      } finally {
        await reservation.release()
      }
    }
    expect(days.size).toBeLessThan(poolSize * 2 + 1)
  })

  it('gives concurrent callers distinct owned days', async () => {
    const [first, second] = await Promise.all([
      acquireTestAiUsageDateReservation(),
      acquireTestAiUsageDateReservation(),
    ])
    onTestFinished(async () => {
      await Promise.all([first.release(), second.release()])
    })

    expect(first.day).not.toBe(second.day)
    expect(Date.parse(first.day)).toBeLessThan(Date.now())
    expect(Date.parse(second.day)).toBeLessThan(Date.now())
  })

  it('does not advance authenticated fixture ids beyond the restored real clock', async () => {
    const user = await createTestUser()
    const before = Date.now()
    await withReservedAiUsageDay(1000, async () => {
      await createAuthenticatedTestSession(user)
    })
    const tokens = await createAuthenticatedTestSession(user)
    const timestamp = Number.parseInt(
      tokens.deviceToken.payload.did.replaceAll('-', '').slice(0, 12),
      16,
    )
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('does not recycle a released ordinary day or reuse its cached ledger total', async () => {
    const first = await acquireTestAiUsageDateReservation()
    onTestFinished(() => first.release())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${first.day}T12:00:00.000Z`))
    await insertTestAiUsageRecord({
      id: timestampToUuidv7LowerBound(Date.now()),
      costMicrounits: 321,
    })
    await expect(getDailyAiCostTotalMicrounits()).resolves.toMatchObject({ totalMicrounits: 321 })
    await first.release()
    // Slot choice follows Date. Acquiring again while the clock sits inside the reserved day
    // drops every slot that reaches that day, and the earliest day then has none left.
    vi.useRealTimers()

    const second = await acquireTestAiUsageDateReservation()
    onTestFinished(() => second.release())
    expect(second.day).not.toBe(first.day)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${first.day}T12:00:00.000Z`))
    await expect(getDailyAiCostTotalMicrounits(second.day)).resolves.toEqual({
      totalMicrounits: 0,
      day: second.day,
    })
    vi.setSystemTime(new Date(`${second.day}T12:00:00.000Z`))
    await expect(getDailyAiCostTotalMicrounits()).resolves.toEqual({
      totalMicrounits: 0,
      day: second.day,
    })
  })

  it('cleans owned rows on release and starts a reused control month empty', async () => {
    const initial = await acquireTestAiUsageDateReservationControlSlot()
    onTestFinished(() => initial.release())
    const dayStartMs = Date.parse(`${initial.day}T00:00:00.000Z`)
    await insertTestAiUsageRecord({
      id: timestampToUuidv7LowerBound(dayStartMs),
      costMicrounits: 999,
    })
    await initial.release()

    const reservation = await acquireTestAiUsageDateReservationControlSlot()
    onTestFinished(() => reservation.release())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${reservation.day}T12:00:00.000Z`))
    await expect(refreshDailyAiCostTotalMicrounits()).resolves.toMatchObject({ totalMicrounits: 0 })

    await insertTestAiUsageRecord({
      id: timestampToUuidv7LowerBound(dayStartMs + 12 * 60 * 60 * 1000),
      costMicrounits: 321,
    })
    await expect(refreshDailyAiCostTotalMicrounits()).resolves.toMatchObject({
      totalMicrounits: 321,
    })
    await Promise.all([reservation.release(), reservation.release()])
    await expect(refreshDailyAiCostTotalMicrounits()).resolves.toMatchObject({ totalMicrounits: 0 })
    await reservation.release()
  })
})
