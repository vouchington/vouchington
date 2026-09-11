import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  acquireTestAiUsageDateReservation,
  createTestUser,
  insertTestAiUsageRecord,
  insertTestCommunity,
} from '@voucha/test-helpers'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'
import { MAX_MONEY_AMOUNT } from '@ts-shared/money'
import type { PrivateUser } from '@services/users/types'
import { recordAiUsage } from '../record.mts'
import {
  clearDailyAiCostTotalCacheForTesting,
  getDailyAiCostTotalMicrounits,
  parseDailyTotalMicrounits,
  refreshDailyAiCostTotalMicrounits,
} from '../daily-total.mts'

describe('parseDailyTotalMicrounits', () => {
  it('rethrows a non-RangeError from parsePostgresMoneyAmount instead of clamping it', () => {
    // '01' is non-canonical (leading zero), so parsePostgresMoneyAmount throws TypeError, not
    // RangeError -- that must propagate as-is. Only the overflow RangeError is a safe-to-clamp
    // "spend exceeded the cap" signal; any other error means the stored value itself is corrupt,
    // and clamping it would silently mask that instead of surfacing it.
    expect(() => parseDailyTotalMicrounits('01')).toThrow(TypeError)
  })
})

describe('getDailyAiCostTotalMicrounits', () => {
  const invalidExtendedUtcDayError = 'Invalid UTC day: +012000-01'
  let user: PrivateUser

  beforeEach(async () => {
    user = await createTestUser()
    vi.useFakeTimers({ toFake: ['Date'] })
    clearDailyAiCostTotalCacheForTesting()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearDailyAiCostTotalCacheForTesting()
  })

  async function reserveDay(): Promise<string> {
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    return reservation.day
  }

  it('sums cost_microunits within the UTC-day boundary, including NULL-community rows, and excludes rows outside it', async () => {
    const includedRowsDay = await reserveDay()
    vi.setSystemTime(new Date(`${includedRowsDay}T12:00:00.000Z`))
    const community = await insertTestCommunity({ createdById: user.id })
    const dayStartMs = Date.parse(`${includedRowsDay}T00:00:00.000Z`)

    await Promise.all([
      // At the day's exact lower bound -- inclusive, and community-scoped.
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs),
        communityId: community.id,
        costMicrounits: 100,
      }),
      // Mid-day, with no community -- covers the NULL-community_id gap in getCommunityAiCostTotals.
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs + 12 * 60 * 60 * 1000),
        communityId: null,
        costMicrounits: 250,
      }),
      // The prior day's final millisecond -- must be excluded.
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs - 1),
        costMicrounits: 999_999,
      }),
      // The next day's exact lower bound -- exclusive, must be excluded.
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs + 24 * 60 * 60 * 1000),
        costMicrounits: 999_999,
      }),
    ])

    await expect(getDailyAiCostTotalMicrounits()).resolves.toEqual({
      totalMicrounits: 350,
      hasUnpricedRows: false,
      day: includedRowsDay,
    })
  })

  it('attributes recordAiUsage`s createdAt-backdated row to the request day, not the day the ledger insert runs', async () => {
    // Reproduces the bug behind #8773 Finding 1: a background response created on one UTC day but
    // recorded (via claimAndRecordBackgroundResponseUsage, after the model call finishes or
    // reconcile.mts recovers it) on the next must still bucket by its createdAt, not by
    // ai_usage_records.id's default "now" timestamp. Only the responseId-bearing branch of
    // recordAiUsage honors createdAt (record.mts), so responseId is required here to exercise the
    // fixed code path at all.
    //
    // createdAt is anchored at noon, not near midnight: PG18's uuidv7(interval) shift, evaluated
    // under this backend's America/Los_Angeles session timezone, drifts by exactly the DST offset
    // difference (~1h) whenever "real now" (whatever the test happens to run) and a
    // reservation target land on opposite sides of a DST transition -- confirmed
    // empirically against the dev DB, constant regardless of shift magnitude. That drift is
    // irrelevant to production (a real createdAt is always minutes old, never spanning a DST
    // change) but would flip a midnight-adjacent anchor to the wrong day depending on which
    // calendar month the random future day lands on. Noon keeps a wide, deterministic margin.
    const requestDay = await reserveDay()
    const insertDay = new Date(Date.parse(`${requestDay}T00:00:00.000Z`) + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    vi.setSystemTime(new Date(`${insertDay}T00:00:05.000Z`))
    await recordAiUsage({
      responseId: `resp_${randomUUID()}`,
      agentSlug: 'test-daily-total-backdate',
      // Unpriced on purpose: hasUnpricedRows is a clean boolean signal that the row landed inside
      // the queried day's id range, with no pricing-table math to duplicate in this assertion.
      model: 'unknown-model',
      serviceTier: 'default',
      usage: { input_tokens: 10, output_tokens: 5 },
      createdAt: new Date(`${requestDay}T12:00:00.000Z`),
    })

    vi.setSystemTime(new Date(`${requestDay}T12:00:00.000Z`))
    await expect(getDailyAiCostTotalMicrounits()).resolves.toEqual({
      totalMicrounits: 0,
      hasUnpricedRows: true,
      day: requestDay,
    })

    vi.setSystemTime(new Date(`${insertDay}T12:00:00.000Z`))
    await expect(getDailyAiCostTotalMicrounits()).resolves.toEqual({
      totalMicrounits: 0,
      hasUnpricedRows: false,
      day: insertDay,
    })
  })

  it('returns hasUnpricedRows: true when a row in the window has no pricing-table entry, even though the priced total alone is nonzero', async () => {
    const day = await reserveDay()
    vi.setSystemTime(new Date(`${day}T12:00:00.000Z`))

    await Promise.all([
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(Date.now()),
        costMicrounits: 100,
      }),
      // +1ms so this row's id-derived timestamp differs from the one above -- otherwise both
      // resolve to the same id lower bound and collide on the primary key.
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(Date.now() + 1),
        pricingStatus: 'unpriced',
      }),
    ])

    await expect(getDailyAiCostTotalMicrounits()).resolves.toEqual({
      totalMicrounits: 100,
      hasUnpricedRows: true,
      day,
    })
  })

  it('returns 0 and hasUnpricedRows: false for a day with no ai_usage_records rows', async () => {
    const day = await reserveDay()
    vi.setSystemTime(new Date(`${day}T00:00:00.000Z`))

    await expect(getDailyAiCostTotalMicrounits()).resolves.toEqual({
      totalMicrounits: 0,
      hasUnpricedRows: false,
      day,
    })
  })

  it('reuses the cached promise for a second call within the TTL window on the same day', async () => {
    const day = await reserveDay()
    vi.setSystemTime(new Date(`${day}T00:00:00.000Z`))

    const first = getDailyAiCostTotalMicrounits()
    await expect(first).resolves.toEqual({ totalMicrounits: 0, hasUnpricedRows: false, day })

    // Same faked "now" -- still inside the 60s TTL and on the same cache day, so this must return
    // the identical cached promise rather than re-running the query.
    const second = getDailyAiCostTotalMicrounits()
    expect(second).toBe(first)
    await expect(second).resolves.toEqual({ totalMicrounits: 0, hasUnpricedRows: false, day })
  })

  it('clamps to MAX_MONEY_AMOUNT instead of crashing when the raw SUM overflows the JSON-safe integer range', async () => {
    // A runaway ingestion day is exactly the scenario the spend cap exists to catch -- the guard
    // must fail closed here (report the max representable amount, which trips any realistic cap)
    // rather than let parsePostgresMoneyAmount's overflow RangeError crash the request.
    const day = await reserveDay()
    vi.setSystemTime(new Date(`${day}T12:00:00.000Z`))
    const dayStartMs = Date.parse(`${day}T00:00:00.000Z`)

    await Promise.all([
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs),
        costMicrounits: MAX_MONEY_AMOUNT,
      }),
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs + 1),
        costMicrounits: MAX_MONEY_AMOUNT,
      }),
    ])

    await expect(getDailyAiCostTotalMicrounits()).resolves.toEqual({
      totalMicrounits: MAX_MONEY_AMOUNT,
      hasUnpricedRows: false,
      day,
    })
  })

  it('clears the cache entry on a query failure instead of reusing the rejected promise', async () => {
    // Year 12000 uses ISO's expanded-year form, outside the YYYY-MM-DD UTC-day contract, so
    // getDayBounds throws synchronously inside loadDailyAiCostTotalMicrounits -- no
    // @data-stores/psql mocking needed to exercise the failure path.
    vi.setSystemTime(new Date(Date.UTC(12000, 0, 1)))

    const first = getDailyAiCostTotalMicrounits()
    await expect(first).rejects.toThrow(invalidExtendedUtcDayError)

    // Same faked "now" and thus the same cache day/TTL window as the first call -- if the failed
    // entry weren't cleared, this would resolve to the exact same (rejected) cached promise.
    const second = getDailyAiCostTotalMicrounits()
    expect(second).not.toBe(first)
    await expect(second).rejects.toThrow(invalidExtendedUtcDayError)
  })

  it('bypasses stale cache, coalesces concurrent refreshes, and replaces normal cache', async () => {
    const day = await reserveDay()
    vi.setSystemTime(new Date(`${day}T12:00:00.000Z`))
    const cached = getDailyAiCostTotalMicrounits()
    await expect(cached).resolves.toEqual({ totalMicrounits: 0, hasUnpricedRows: false, day })

    await insertTestAiUsageRecord({
      id: timestampToUuidv7LowerBound(Date.now()),
      costMicrounits: 1,
    })

    const firstRefresh = refreshDailyAiCostTotalMicrounits()
    const secondRefresh = refreshDailyAiCostTotalMicrounits()
    expect(secondRefresh).toBe(firstRefresh)
    expect(firstRefresh).not.toBe(cached)
    await expect(firstRefresh).resolves.toEqual({ totalMicrounits: 1, hasUnpricedRows: false, day })
    expect(getDailyAiCostTotalMicrounits()).toBe(firstRefresh)
  })

  it('clears refresh coordination after a query failure instead of reusing the rejected promise', async () => {
    vi.setSystemTime(new Date(Date.UTC(12000, 0, 1)))

    const first = refreshDailyAiCostTotalMicrounits()
    await expect(first).rejects.toThrow(invalidExtendedUtcDayError)

    const second = refreshDailyAiCostTotalMicrounits()
    expect(second).not.toBe(first)
    await expect(second).rejects.toThrow(invalidExtendedUtcDayError)
  })
})
