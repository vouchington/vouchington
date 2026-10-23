import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser, insertTestAiUsageRecord, insertTestCommunity } from '@voucha/test-helpers'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import {
  countTestAiUsageRows,
  clearTestAiUsageOverflowFixture,
  hasTestClassifierIdentity,
  hasTestAiUsageResponseKey,
  insertTestAiUsageResponseKey,
  readTestAiUsageRetentionCursor,
  readTestAiUsageRollups,
  reserveTestAiUsageRetentionSweep,
  seedTestAiUsageCommunityRollup,
} from '@voucha/test-helpers/entities/ai-usage-rollups'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { getCommunityAiCostTotals } from '../ai-usage/totals.mts'
import {
  getDailyAiCostTotalMicrounits,
  refreshDailyAiCostTotalMicrounits,
} from '../ai-usage/daily-total.mts'
import { readClassifierRunUsage } from '../classifier-runs/usage-report-runs.mts'
import { cleanupAiUsageRecords } from './cleanup-ai-usage.mts'

const DAY_MS = 24 * 60 * 60 * 1000

function uuidAt(timestamp: number): string {
  // Keep the UUIDv7 timestamp while varying its random tail across repeated test runs.
  return `${timestampToUuidv7LowerBound(timestamp).slice(0, 24)}${randomBytes(6).toString('hex')}`
}

async function readCommunityCost(communityId: string): Promise<{
  calls: number
  cost: string
  unpriced: number
  inputTokens: number
  outputTokens: number
}> {
  let after: string | undefined
  for (;;) {
    // Each page is bounded; this is an administrative all-community ranking, not a retention sweep.
    const page = await getCommunityAiCostTotals({ limit: 100, after })
    const row = page.results.find(result => result.community_id === communityId)
    if (row) {
      return {
        calls: row.request_count,
        cost: row.total_cost.amount,
        unpriced: row.unpriced_request_count,
        inputTokens: row.total_input_tokens,
        outputTokens: row.total_output_tokens,
      }
    }
    if (!page.page_info.has_next_page || !page.page_info.end_cursor) {
      throw new Error('Test community was absent from AI cost totals')
    }
    after = page.page_info.end_cursor
  }
}

describe('AI usage retention', () => {
  let releaseSweep: (() => Promise<void>) | undefined

  beforeAll(async () => {
    releaseSweep = await reserveTestAiUsageRetentionSweep()
  }, 30_000)

  afterAll(async () => {
    await releaseSweep?.()
  })

  it('folds a partial month and a prior month atomically, resumes, and never counts a rerun twice', async () => {
    const year = 7000 + randomInt(900)
    const month = (monthIndex: number): string =>
      `${year}-${String(monthIndex).padStart(2, '0')}-01`
    const date = (monthIndex: number, day: number): Date =>
      new Date(Date.UTC(year, monthIndex - 1, day, 12))
    const idAt = (monthIndex: number, day: number): string =>
      uuidAt(date(monthIndex, day).getTime())
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const janCommunity = await insertTestAiUsageRecord({
      id: idAt(1, 31),
      communityId: community.id,
      costMicrounits: 11,
    })
    const janGlobal = await insertTestAiUsageRecord({
      id: idAt(1, 30),
      communityId: null,
      costMicrounits: 13,
    })
    const febOld = await insertTestAiUsageRecord({
      id: idAt(2, 14),
      communityId: community.id,
      pricingStatus: 'unpriced',
    })
    const febRecent = await insertTestAiUsageRecord({
      id: idAt(2, 16),
      communityId: community.id,
      costMicrounits: 17,
    })
    const recentRunId = await reserveSyntheticRunId()
    await insertTestAiUsageRecord({ classifierRunId: recentRunId, costMicrounits: 19 })
    const reportWindow = {
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
    }
    const recentRunBefore = (await readClassifierRunUsage(reportWindow)).find(
      run => run.runId === recentRunId,
    )
    expect(recentRunBefore).toMatchObject({ providerCalls: 1, costMicrounits: '19' })
    const ownedIds = [janCommunity, janGlobal, febOld, febRecent]
    const before = await readCommunityCost(community.id)
    expect(before).toEqual({
      calls: 3,
      cost: '28',
      unpriced: 1,
      inputTokens: 300,
      outputTokens: 150,
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    let dailyBefore: Awaited<ReturnType<typeof getDailyAiCostTotalMicrounits>>
    try {
      vi.setSystemTime(date(2, 16))
      dailyBefore = await getDailyAiCostTotalMicrounits()
    } finally {
      vi.useRealTimers()
    }
    expect(dailyBefore.totalMicrounits).toBeGreaterThanOrEqual(17)
    const janBefore = await readTestAiUsageRollups(community.id, month(1))
    const febBefore = await readTestAiUsageRollups(community.id, month(2))
    const cutoff = date(2, 15)
    const now = new Date(cutoff.getTime() + 180 * DAY_MS)
    const options = {
      now,
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: date(1, 29),
      upperBoundDate: date(2, 20),
    }

    const first = await cleanupAiUsageRecords(options)
    expect(first).toMatchObject({ deleted: 1, hasMore: true })
    expect(first.cursorId).toBe(janGlobal)
    // The saved sweep end stays fixed even if a later tick sees a newer wall clock.
    const laterTick = { ...options, now: new Date(now.getTime() + 3 * DAY_MS) }
    const second = await cleanupAiUsageRecords(laterTick)
    expect(second).toMatchObject({ deleted: 1, hasMore: true })
    expect(second.cursorId).toBe(janCommunity)
    const third = await cleanupAiUsageRecords(laterTick)
    expect(third).toMatchObject({ deleted: 1, hasMore: false, cursorId: null })
    expect(await countTestAiUsageRows(ownedIds)).toBe(1)
    expect(await readCommunityCost(community.id)).toEqual(before)
    expect(
      (await readClassifierRunUsage(reportWindow)).find(run => run.runId === recentRunId),
    ).toEqual(recentRunBefore)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(date(2, 16))
      expect(await refreshDailyAiCostTotalMicrounits()).toEqual(dailyBefore)
    } finally {
      vi.useRealTimers()
    }

    const janAfter = await readTestAiUsageRollups(community.id, month(1))
    const febAfter = await readTestAiUsageRollups(community.id, month(2))
    expect(Number(janAfter.communityCalls) - Number(janBefore.communityCalls)).toBe(1)
    expect(Number(janAfter.communityCost) - Number(janBefore.communityCost)).toBe(11)
    expect(Number(janAfter.globalCalls) - Number(janBefore.globalCalls)).toBe(2)
    expect(Number(janAfter.globalCost) - Number(janBefore.globalCost)).toBe(24)
    expect(Number(febAfter.communityCalls) - Number(febBefore.communityCalls)).toBe(1)
    expect(Number(febAfter.communityCost) - Number(febBefore.communityCost)).toBe(0)
    expect(Number(febAfter.globalUnpricedCalls) - Number(febBefore.globalUnpricedCalls)).toBe(1)

    expect(await cleanupAiUsageRecords(options)).toMatchObject({
      deleted: 0,
      hasMore: false,
      cursorId: null,
    })
    expect(await readTestAiUsageRollups(community.id, month(1))).toEqual(janAfter)
    expect(await readTestAiUsageRollups(community.id, month(2))).toEqual(febAfter)
  })

  it('rejects historical run usage after raw rows expire while the replay identity remains', async () => {
    const runId = await reserveSyntheticRunId()
    const rawAt = Date.now() + 10_000
    const rawId = await insertTestAiUsageRecord({
      id: uuidAt(rawAt),
      classifierRunId: runId,
      costMicrounits: 31,
    })
    const result = await cleanupAiUsageRecords({
      now: new Date(rawAt + 181 * DAY_MS),
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: new Date(rawAt - 1_000),
      upperBoundDate: new Date(rawAt + 1_000),
    })
    expect(result.deleted).toBe(1)
    expect(await countTestAiUsageRows([rawId])).toBe(0)
    expect(await hasTestClassifierIdentity(runId)).toBe(true)

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(rawAt + 181 * DAY_MS))
      await expect(
        readClassifierRunUsage({
          from: new Date(rawAt - 60_000),
          to: new Date(rawAt + 60_000),
        }),
      ).rejects.toThrow('Classifier report window starts before the retention cutoff')
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves a later response key for its approved replay window even when raw usage is old', async () => {
    const year = 8100 + randomInt(600)
    const rawAt = Date.UTC(year, 2, 1, 12)
    const rawId = await insertTestAiUsageRecord({
      id: uuidAt(rawAt),
      costMicrounits: 41,
    })
    const followingId = await insertTestAiUsageRecord({
      id: uuidAt(rawAt + 12 * 60 * 60 * 1000),
      costMicrounits: 43,
    })
    const keyId = uuidAt(rawAt + 150 * DAY_MS)
    const responseId = await insertTestAiUsageResponseKey(keyId, rawId)
    const bounds = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: new Date(rawAt - 1_000),
      upperBoundDate: new Date(rawAt + DAY_MS),
    }

    expect(await cleanupAiUsageRecords({ ...bounds, now: new Date(rawAt + 181 * DAY_MS) })).toEqual(
      {
        deleted: 0,
        hasMore: true,
        cursorId: rawId,
      },
    )
    expect(await cleanupAiUsageRecords({ ...bounds, now: new Date(rawAt + 181 * DAY_MS) })).toEqual(
      {
        deleted: 1,
        hasMore: false,
        cursorId: null,
      },
    )
    expect(await countTestAiUsageRows([rawId])).toBe(1)
    expect(await countTestAiUsageRows([followingId])).toBe(0)
    expect(await hasTestAiUsageResponseKey(responseId)).toBe(true)

    expect(
      await cleanupAiUsageRecords({ ...bounds, now: new Date(rawAt + 241 * DAY_MS) }),
    ).toMatchObject({ deleted: 1, hasMore: false })
    expect(await countTestAiUsageRows([rawId])).toBe(0)
    expect(await hasTestAiUsageResponseKey(responseId)).toBe(false)
  })

  it('rolls back deletion and checkpoint if a stored monthly BIGINT sum overflows', async () => {
    const year = 8700 + randomInt(600)
    const monthStart = `${year}-01-01`
    const rawAt = Date.UTC(year, 0, 2, 12)
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const rawId = await insertTestAiUsageRecord({
      id: uuidAt(rawAt),
      communityId: community.id,
      costMicrounits: 10,
    })
    const nearMax = (9_223_372_036_854_775_807n - 7n).toString()
    await seedTestAiUsageCommunityRollup(community.id, monthStart, nearMax)
    const before = await readTestAiUsageRollups(community.id, monthStart)
    const cursorBefore = await readTestAiUsageRetentionCursor()
    try {
      await expect(
        cleanupAiUsageRecords({
          now: new Date(rawAt + 181 * DAY_MS),
          batchSize: 1,
          maxBatches: 1,
          lowerBoundDate: new Date(rawAt - 1_000),
          upperBoundDate: new Date(rawAt + 1_000),
        }),
      ).rejects.toThrow(/out of range/)
      expect(await countTestAiUsageRows([rawId])).toBe(1)
      expect(await readTestAiUsageRollups(community.id, monthStart)).toEqual(before)
      expect(await readTestAiUsageRetentionCursor()).toEqual(cursorBefore)
    } finally {
      await clearTestAiUsageOverflowFixture(community.id, monthStart, rawId)
    }
  })
})
