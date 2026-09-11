import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { acquireTestAiUsageDateReservation, insertTestAiUsageRecord } from '@voucha/test-helpers'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'
import type { OpenAiSpendCapBreachContext } from '@modules/on-error/openai-spend-cap-breach'
import { clearDailyAiCostTotalCacheForTesting, type DailyAiCostTotal } from '../daily-total.mts'
import { openAiSpendCapConfig } from '../spend-cap-config.mts'
import {
  assertOpenAiSpendCapNotBreached,
  evaluateOpenAiSpendCapBreach,
  OpenAiSpendCapBreachError,
} from '../spend-cap-guard.mts'

describe('OpenAiSpendCapBreachError', () => {
  it('carries the HTTP status @jongleberry/api-server needs to report 429 for an uncaught throw', () => {
    const error = new OpenAiSpendCapBreachError({
      reason: 'cap_exceeded',
      totalMicrounits: 1_000_000,
      dailyCapMicrounits: 1_000_000,
      day: '2026-03-01',
    })

    expect(error.status).toBe(429)
    expect(error.statusCode).toBe(429)
    expect(error.expose).toBe(true)
  })
})

describe('evaluateOpenAiSpendCapBreach', () => {
  it('returns null without querying the daily total when the cap is disabled', async () => {
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const getAccountingUncertaintySource = vi.fn<() => Promise<null>>()

    const result = await evaluateOpenAiSpendCapBreach({
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 1_000_000 }),
      getDailyAiCostTotalMicrounits,
      getAccountingUncertaintySource,
    })

    expect(result).toBeNull()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
    expect(getAccountingUncertaintySource).not.toHaveBeenCalled()
  })

  it('returns null when the daily total is below the cap and no unpriced rows exist', async () => {
    const result = await evaluateOpenAiSpendCapBreach({
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
      getAccountingUncertaintySource: () => Promise.resolve(null),
      getDailyAiCostTotalMicrounits: () =>
        Promise.resolve({ totalMicrounits: 999_999, hasUnpricedRows: false, day: '2026-03-01' }),
    })

    expect(result).toBeNull()
  })

  it('returns a cap_exceeded breach once the daily total reaches the cap', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))
    try {
      const result = await evaluateOpenAiSpendCapBreach({
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getAccountingUncertaintySource: () => Promise.resolve(null),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({
            totalMicrounits: 1_000_000,
            hasUnpricedRows: false,
            day: '2026-03-01',
          }),
      })

      expect(result).toEqual({
        reason: 'cap_exceeded',
        totalMicrounits: 1_000_000,
        dailyCapMicrounits: 1_000_000,
        day: '2026-03-01',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns an unpriced_rows breach even when the priced total alone is under the cap', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))
    try {
      const result = await evaluateOpenAiSpendCapBreach({
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getAccountingUncertaintySource: () => Promise.resolve(null),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 100, hasUnpricedRows: true, day: '2026-03-01' }),
      })

      expect(result).toEqual({
        reason: 'unpriced_rows',
        totalMicrounits: 100,
        dailyCapMicrounits: 1_000_000,
        day: '2026-03-01',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts evaluation when the UTC day changes before a decision is returned', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-01T23:59:59.000Z'))
    const queriedDays: string[] = []
    try {
      const result = await evaluateOpenAiSpendCapBreach({
        waitForOpenAiSpendCapConfig: async () => {
          if (getCurrentUtcDay() === '2026-03-01') {
            vi.setSystemTime(new Date('2026-03-02T00:00:01.000Z'))
          }
        },
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getAccountingUncertaintySource: () => Promise.resolve(null),
        getDailyAiCostTotalMicrounits: async (day = getCurrentUtcDay()) => {
          queriedDays.push(day)
          return {
            totalMicrounits: day === '2026-03-01' ? 1_000_000 : 100,
            hasUnpricedRows: false,
            day,
          }
        },
      })

      expect(result).toBeNull()
      expect(queriedDays).toEqual(['2026-03-01', '2026-03-02'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('awaits waitForOpenAiSpendCapConfig before reading the cap fields', async () => {
    const calls: string[] = []

    await evaluateOpenAiSpendCapBreach({
      waitForOpenAiSpendCapConfig: () => {
        calls.push('wait')
        return Promise.resolve()
      },
      getOpenAiSpendCapFields: () => {
        calls.push('fields')
        return { enabled: false, daily_cap_microunits: 1_000_000 }
      },
      getAccountingUncertaintySource: () => Promise.resolve(null),
      getDailyAiCostTotalMicrounits: vi.fn<() => Promise<DailyAiCostTotal>>(),
    })

    expect(calls).toEqual(['wait', 'fields'])
  })

  it('returns accounting uncertainty before querying the ledger total', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-01T23:59:59.000Z'))
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    try {
      const result = await evaluateOpenAiSpendCapBreach({
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getAccountingUncertaintySource: () => Promise.resolve('ledger_write_failed'),
        getDailyAiCostTotalMicrounits,
      })

      expect(result).toEqual({
        reason: 'accounting_uncertain',
        totalMicrounits: null,
        dailyCapMicrounits: 1_000_000,
        day: '2026-03-01',
        uncertaintySource: 'ledger_write_failed',
      })
      expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed when the primary latch read fails', async () => {
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const result = await evaluateOpenAiSpendCapBreach({
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
      getAccountingUncertaintySource: () => Promise.reject(new Error('Valkey unavailable')),
      getDailyAiCostTotalMicrounits,
    })

    expect(result).toMatchObject({
      reason: 'accounting_uncertain',
      totalMicrounits: null,
      uncertaintySource: 'latch_read_failed',
    })
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })
})

describe('assertOpenAiSpendCapNotBreached', () => {
  beforeEach(async () => {
    await openAiSpendCapConfig.waitForInitialization()
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${reservation.day}T12:00:00.000Z`))
    clearDailyAiCostTotalCacheForTesting()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearDailyAiCostTotalCacheForTesting()
  })

  it('returns null and does not record a breach when the daily total is under the cap', async () => {
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      daily_cap_microunits: 1_000_000,
    })
    try {
      await insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(Date.now()),
        costMicrounits: 100,
      })

      const result = await assertOpenAiSpendCapNotBreached('test-caller', {
        recordOpenAiSpendCapBreach,
      })

      expect(result).toBeNull()
      expect(recordOpenAiSpendCapBreach).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('records a breach tagged with the given callerName and returns it once the cap is breached', async () => {
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()
    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      daily_cap_microunits: 100,
    })
    try {
      await insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(Date.now()),
        costMicrounits: 1_000_000,
      })

      const result = await assertOpenAiSpendCapNotBreached('test-caller', {
        recordOpenAiSpendCapBreach,
      })

      expect(result).toMatchObject({ reason: 'cap_exceeded', dailyCapMicrounits: 100 })
      expect(recordOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
        agentJobName: 'test-caller',
        dailyTotalMicrounits: 1_000_000,
        dailyCapMicrounits: 100,
        reason: 'cap_exceeded',
      })
    } finally {
      restore()
    }
  })

  it('records accounting uncertainty with a nullable total and its diagnostic source', async () => {
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()

    const result = await assertOpenAiSpendCapNotBreached('test-caller', {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
      getAccountingUncertaintySource: () => Promise.resolve('ledger_write_failed'),
      getDailyAiCostTotalMicrounits: vi.fn<() => Promise<DailyAiCostTotal>>(),
      recordOpenAiSpendCapBreach,
    })

    expect(result).toMatchObject({
      reason: 'accounting_uncertain',
      totalMicrounits: null,
      uncertaintySource: 'ledger_write_failed',
    })
    expect(recordOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      agentJobName: 'test-caller',
      dailyTotalMicrounits: null,
      dailyCapMicrounits: 1_000_000,
      reason: 'accounting_uncertain',
      uncertaintySource: 'ledger_write_failed',
    })
  })
})
