import { describe, expect, it, vi } from 'vitest'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'
import type { SpendCapBreachContext } from '@modules/on-error/spend-cap-breach'
import type { getDailyAiCostTotalMicrounits } from '../daily-total.mts'
import {
  assertDailySpendCapNotBreached,
  evaluateSpendCapBreach,
  SpendCapBreachError,
} from '../spend-cap-guard.mts'

type DailyAiCostTotal = Awaited<ReturnType<typeof getDailyAiCostTotalMicrounits>>

function guardDeps(totalMicrounits: number, cap = 100) {
  return {
    waitForSpendCapConfig: () => Promise.resolve(),
    getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: cap }),
    getDailyAiCostTotalMicrounits: (day?: string) =>
      Promise.resolve({ totalMicrounits, day: day ?? getCurrentUtcDay() }),
  }
}

describe('SpendCapBreachError', () => {
  it('carries the HTTP status for a confirmed over-cap call', () => {
    const error = new SpendCapBreachError({
      reason: 'cap_exceeded',
      totalMicrounits: 101,
      dailyCapMicrounits: 100,
      day: getCurrentUtcDay(),
    })
    expect(error).toMatchObject({ status: 429, statusCode: 429 })
  })
})

describe('evaluateSpendCapBreach', () => {
  it('skips the usage read when enforcement is disabled', async () => {
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    await expect(
      evaluateSpendCapBreach({
        ...guardDeps(101),
        getSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 100 }),
        getDailyAiCostTotalMicrounits,
      }),
    ).resolves.toBeNull()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it.each([0, 99, 100])('allows a recorded total of %i at a cap of 100', async total => {
    await expect(evaluateSpendCapBreach(guardDeps(total))).resolves.toBeNull()
  })

  it('blocks only when the known recorded total is over the cap', async () => {
    await expect(evaluateSpendCapBreach(guardDeps(101))).resolves.toEqual({
      reason: 'cap_exceeded',
      totalMicrounits: 101,
      dailyCapMicrounits: 100,
      day: getCurrentUtcDay(),
    })
  })

  it('allows zero recorded spend with a zero cap', async () => {
    await expect(evaluateSpendCapBreach(guardDeps(0, 0))).resolves.toBeNull()
    await expect(evaluateSpendCapBreach(guardDeps(1, 0))).resolves.toMatchObject({
      reason: 'cap_exceeded',
    })
  })

  it('fails open when config or usage cannot be read', async () => {
    await expect(
      evaluateSpendCapBreach({
        ...guardDeps(101),
        waitForSpendCapConfig: () => Promise.reject(new Error('config unavailable')),
      }),
    ).resolves.toBeNull()
    await expect(
      evaluateSpendCapBreach({
        ...guardDeps(101),
        getDailyAiCostTotalMicrounits: () => Promise.reject(new Error('database unavailable')),
      }),
    ).resolves.toBeNull()
  })

  it('fails open for malformed or missing reported values', async () => {
    await expect(evaluateSpendCapBreach(guardDeps(Number.NaN))).resolves.toBeNull()
    await expect(evaluateSpendCapBreach(guardDeps(101, -1))).resolves.toBeNull()
    await expect(
      evaluateSpendCapBreach({
        ...guardDeps(101),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 101, day: 'wrong-day' }),
      }),
    ).resolves.toBeNull()
  })
})

describe('assertDailySpendCapNotBreached', () => {
  it('records only a confirmed breach with the caller name', async () => {
    const recordSpendCapBreach = vi.fn<(context: SpendCapBreachContext) => void>()
    await expect(
      assertDailySpendCapNotBreached('test-caller', {
        ...guardDeps(101),
        recordSpendCapBreach,
      }),
    ).resolves.toMatchObject({ reason: 'cap_exceeded' })
    expect(recordSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      agentJobName: 'test-caller',
      dailyTotalMicrounits: 101,
      dailyCapMicrounits: 100,
      reason: 'cap_exceeded',
    })
  })
})
