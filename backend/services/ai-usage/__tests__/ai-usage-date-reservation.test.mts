import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { acquireTestAiUsageDateReservation, insertTestAiUsageRecord } from '@voucha/test-helpers'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'
import { acquireTestAiUsageDateReservationControlSlot } from '@voucha/test-helpers/entities/ai-usage-date-reservation'
import {
  clearDailyAiCostTotalCacheForTesting,
  getDailyAiCostTotalMicrounits,
} from '../daily-total.mts'

describe('acquireTestAiUsageDateReservation', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearDailyAiCostTotalCacheForTesting()
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
  })

  it('cleans polluted rows before acquisition, again on release, and when its control slot is reused', async () => {
    const initial = await acquireTestAiUsageDateReservationControlSlot()
    onTestFinished(() => initial.release())
    const dayStartMs = Date.parse(`${initial.day}T00:00:00.000Z`)
    await initial.release()

    await insertTestAiUsageRecord({
      id: timestampToUuidv7LowerBound(dayStartMs),
      costMicrounits: 999,
    })

    const reservation = await acquireTestAiUsageDateReservationControlSlot()
    onTestFinished(() => reservation.release())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${reservation.day}T12:00:00.000Z`))
    clearDailyAiCostTotalCacheForTesting()
    await expect(getDailyAiCostTotalMicrounits()).resolves.toMatchObject({ totalMicrounits: 0 })

    await insertTestAiUsageRecord({
      id: timestampToUuidv7LowerBound(dayStartMs + 12 * 60 * 60 * 1000),
      costMicrounits: 321,
    })
    clearDailyAiCostTotalCacheForTesting()
    await expect(getDailyAiCostTotalMicrounits()).resolves.toMatchObject({ totalMicrounits: 321 })
    await Promise.all([reservation.release(), reservation.release()])
    clearDailyAiCostTotalCacheForTesting()
    await expect(getDailyAiCostTotalMicrounits()).resolves.toMatchObject({ totalMicrounits: 0 })
    await reservation.release()
  })
})
