import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { acquireTestAiUsageDateReservation, insertTestAiUsageRecord } from '@voucha/test-helpers'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { acquireTestAiUsageDateReservationControlSlot } from '@voucha/test-helpers/entities/ai-usage-date-reservation'
import {
  getDailyAiCostTotalMicrounits,
  refreshDailyAiCostTotalMicrounits,
} from '../daily-total.mts'

describe('acquireTestAiUsageDateReservation', () => {
  afterEach(() => {
    vi.useRealTimers()
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

    const second = await acquireTestAiUsageDateReservation()
    onTestFinished(() => second.release())
    expect(second.day).not.toBe(first.day)
    vi.setSystemTime(new Date(`${second.day}T12:00:00.000Z`))
    await expect(getDailyAiCostTotalMicrounits()).resolves.toEqual({
      totalMicrounits: 0,
      hasUnpricedRows: false,
      day: second.day,
    })
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
