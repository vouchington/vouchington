import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'
import type { recordSpendCapBreach as RecordSpendCapBreach } from '@modules/on-error/spend-cap-breach'
import { overrideDynamicConfigFieldsForTest } from '../../../test-helpers/dynamic-config.mts'
import type { getDailyAiCostTotalMicrounits } from '../daily-total.mts'
import { spendCapConfig } from '../spend-cap-config.mts'
import {
  assertDailySpendCapNotBreached,
  evaluateSpendCapBreach,
  SpendCapBreachError,
} from '../spend-cap-guard.mts'

type DailyAiCostTotal = Awaited<ReturnType<typeof getDailyAiCostTotalMicrounits>>

async function useSpendCap(enabled: boolean, cap = 100): Promise<void> {
  await spendCapConfig.waitForInitialization()
  onTestFinished(
    overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled, daily_cap_microunits: cap }),
  )
}

function guardDeps(totalMicrounits: number) {
  return {
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
  it('admits a call through the real config and usage read below the maximum cap', async () => {
    await useSpendCap(true, 1_000_000_000_000)
    await expect(evaluateSpendCapBreach()).resolves.toBeNull()
  })

  it('skips the usage read when enforcement is disabled', async () => {
    await useSpendCap(false)
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    await expect(evaluateSpendCapBreach({ getDailyAiCostTotalMicrounits })).resolves.toBeNull()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it.each([0, 99, 100])('allows a recorded total of %i at a cap of 100', async total => {
    await useSpendCap(true)
    await expect(evaluateSpendCapBreach(guardDeps(total))).resolves.toBeNull()
  })

  it('blocks only when the known recorded total is over the cap', async () => {
    await useSpendCap(true)
    await expect(evaluateSpendCapBreach(guardDeps(101))).resolves.toEqual({
      reason: 'cap_exceeded',
      totalMicrounits: 101,
      dailyCapMicrounits: 100,
      day: getCurrentUtcDay(),
    })
  })

  it('allows zero recorded spend with a zero cap', async () => {
    await useSpendCap(true, 0)
    await expect(evaluateSpendCapBreach(guardDeps(0))).resolves.toBeNull()
    await expect(evaluateSpendCapBreach(guardDeps(1))).resolves.toMatchObject({
      reason: 'cap_exceeded',
    })
  })

  it('fails open when config cannot be read', async () => {
    await useSpendCap(true)
    const waitForInitialization = vi
      .spyOn(spendCapConfig, 'waitForInitialization')
      .mockRejectedValueOnce(new Error('config unavailable'))
    onTestFinished(() => {
      waitForInitialization.mockRestore()
    })
    await expect(evaluateSpendCapBreach(guardDeps(101))).resolves.toBeNull()
    expect(waitForInitialization).toHaveBeenCalledOnce()
  })

  it('fails open when usage cannot be read', async () => {
    await useSpendCap(true)
    await expect(
      evaluateSpendCapBreach({
        getDailyAiCostTotalMicrounits: () => Promise.reject(new Error('database unavailable')),
      }),
    ).resolves.toBeNull()
  })

  it('fails open for malformed or missing reported values', async () => {
    await useSpendCap(true)
    await expect(evaluateSpendCapBreach(guardDeps(Number.NaN))).resolves.toBeNull()
    await expect(
      evaluateSpendCapBreach({
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 101, day: 'wrong-day' }),
      }),
    ).resolves.toBeNull()
  })

  it('fails open for a negative cap', async () => {
    await useSpendCap(true, -1)
    await expect(evaluateSpendCapBreach(guardDeps(101))).resolves.toBeNull()
  })
})

describe('evaluateSpendCapBreach across a UTC day boundary', () => {
  // The clock advances while the usage read is in flight, as when midnight passes mid-query.
  async function evaluateAcrossBoundary(
    from: string,
    to: string,
    totalFor: (day: string) => number,
  ) {
    const queriedDays: string[] = []
    await useSpendCap(true)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(from))
      const breach = await evaluateSpendCapBreach({
        getDailyAiCostTotalMicrounits: (day?: string) => {
          queriedDays.push(day ?? 'missing')
          vi.setSystemTime(new Date(to))
          return Promise.resolve({ totalMicrounits: totalFor(day ?? 'missing'), day: day ?? '' })
        },
      })
      return { breach, queriedDays }
    } finally {
      vi.useRealTimers()
    }
  }

  it.each([
    [
      'midnight',
      '2026-03-01T23:59:59.999Z',
      '2026-03-02T00:00:00.000Z',
      '2026-03-01',
      '2026-03-02',
    ],
    [
      'month end',
      '2026-08-31T23:59:59.999Z',
      '2026-09-01T00:00:00.000Z',
      '2026-08-31',
      '2026-09-01',
    ],
  ])(
    'restarts for the new day when %s crosses during the daily-total read',
    async (_boundary, from, to, oldDay, newDay) => {
      const { breach, queriedDays } = await evaluateAcrossBoundary(from, to, day =>
        day === oldDay ? 101 : 0,
      )

      expect(queriedDays).toEqual([oldDay, newDay])
      expect(breach).toBeNull()
    },
  )

  it('stops restarting after two day changes and admits the call', async () => {
    const queriedDays: string[] = []
    const days = [
      '2026-03-02T00:00:00.000Z',
      '2026-03-03T00:00:00.000Z',
      '2026-03-04T00:00:00.000Z',
    ]
    await useSpendCap(true)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))
      const breach = await evaluateSpendCapBreach({
        getDailyAiCostTotalMicrounits: (day?: string) => {
          queriedDays.push(day ?? 'missing')
          vi.setSystemTime(new Date(days[queriedDays.length - 1] ?? days[2]!))
          return Promise.resolve({ totalMicrounits: 101, day: day ?? '' })
        },
      })

      expect(queriedDays).toEqual(['2026-03-01', '2026-03-02', '2026-03-03'])
      expect(breach).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('assertDailySpendCapNotBreached', () => {
  it('records only a confirmed breach with the caller name', async () => {
    await useSpendCap(true)
    const recordSpendCapBreach = vi.fn<typeof RecordSpendCapBreach>()
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
