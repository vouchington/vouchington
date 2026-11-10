import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestAiUsageRecord, insertTestCommunity } from '@voucha/test-helpers'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import {
  countTestAiUsageRows,
  hasTestClassifierIdentity,
  hasTestAiUsageResponseKey,
  insertTestAiUsageResponseKey,
  readTestAiUsageRollups,
  reserveTestAiUsageRetentionSweep,
} from '@voucha/test-helpers/entities/ai-usage-rollups'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import {
  isTestAiUsagePartitionAttached,
  reserveTestAiUsageMonths,
  testAiUsageCandidate,
} from '@voucha/test-helpers/entities/ai-usage-monthly-partitions'
import { retireMonthlyPartitionCandidate } from '@data-stores/psql/migration-runner/monthly-partitions'
import { getCommunityAiCostTotals } from '../ai-usage/totals.mts'
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

  // no-mistakes-timeout-reason: this advisory lock serializes real retention cursor tests across forks.
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
    const releaseMonths = await reserveTestAiUsageMonths([date(1, 1), date(2, 1)])
    const ownedIds: string[] = []
    const ownedCommunityIds: string[] = []
    onTestFinished(() => releaseMonths(ownedIds, ownedCommunityIds))
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    ownedCommunityIds.push(community.id)
    const janCommunity = await insertTestAiUsageRecord({
      id: idAt(1, 31),
      communityId: community.id,
      costMicrounits: 11,
    })
    ownedIds.push(janCommunity)
    const janGlobal = await insertTestAiUsageRecord({
      id: idAt(1, 30),
      communityId: null,
      costMicrounits: 13,
    })
    ownedIds.push(janGlobal)
    const febOld = await insertTestAiUsageRecord({
      id: idAt(2, 14),
      communityId: community.id,
      pricingStatus: 'unpriced',
    })
    ownedIds.push(febOld)
    const febRecent = await insertTestAiUsageRecord({
      id: idAt(2, 16),
      communityId: community.id,
      costMicrounits: 17,
    })
    ownedIds.push(febRecent)
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
    const before = await readCommunityCost(community.id)
    expect(before).toEqual({
      calls: 3,
      cost: '28',
      unpriced: 1,
      inputTokens: 300,
      outputTokens: 150,
    })
    const janBefore = await readTestAiUsageRollups(community.id, month(1))
    const febBefore = await readTestAiUsageRollups(community.id, month(2))
    const cutoff = date(2, 15)
    const now = new Date(cutoff.getTime() + 180 * DAY_MS)
    const january = testAiUsageCandidate(`ai_usage_records__p_${year}_01`)
    const february = testAiUsageCandidate(`ai_usage_records__p_${year}_02`)
    expect(await retireMonthlyPartitionCandidate(january, now, 1)).toMatchObject({
      outcome: 'refused',
      reason: 'in-flight',
    })
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
    expect(await isTestAiUsagePartitionAttached(january.partition)).toBe(false)
    const third = await cleanupAiUsageRecords(laterTick)
    expect(third).toMatchObject({ deleted: 1, hasMore: false, cursorId: null })
    expect(await countTestAiUsageRows(ownedIds)).toBe(1)
    expect(await readCommunityCost(community.id)).toEqual(before)
    expect(
      (await readClassifierRunUsage(reportWindow)).find(run => run.runId === recentRunId),
    ).toEqual(recentRunBefore)

    const janAfter = await readTestAiUsageRollups(community.id, month(1))
    const febAfter = await readTestAiUsageRollups(community.id, month(2))
    expect(janAfter).toMatchObject({ communityCurrency: 'usd', globalCurrency: 'usd' })
    expect(febAfter).toMatchObject({ communityCurrency: 'usd', globalCurrency: 'usd' })
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
    expect(
      await retireMonthlyPartitionCandidate(february, new Date(now.getTime() + 30 * DAY_MS), 1),
    ).toMatchObject({
      outcome: 'refused',
      reason: 'in-flight',
    })
  })

  it('keeps the replay identity after raw run usage expires', async () => {
    const runId = await reserveSyntheticRunId()
    const rawAt = Date.UTC(2000 + randomInt(20), randomInt(12), 12, 12)
    const releaseMonth = await reserveTestAiUsageMonths([new Date(rawAt)])
    const rawId = uuidAt(rawAt)
    onTestFinished(() => releaseMonth([rawId]))
    await insertTestAiUsageRecord({
      id: rawId,
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
  })

  it('preserves a later response key for its approved replay window even when raw usage is old', async () => {
    const year = 8100 + randomInt(600)
    const rawAt = Date.UTC(year, 2, 1, 12)
    const releaseMonths = await reserveTestAiUsageMonths([new Date(rawAt)])
    const ownedIds: string[] = []
    onTestFinished(() => releaseMonths(ownedIds))
    const rawId = await insertTestAiUsageRecord({
      id: uuidAt(rawAt),
      costMicrounits: 41,
    })
    ownedIds.push(rawId)
    const followingId = await insertTestAiUsageRecord({
      id: uuidAt(rawAt + 12 * 60 * 60 * 1000),
      costMicrounits: 43,
    })
    ownedIds.push(followingId)
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
})
