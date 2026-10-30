import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestAiUsageRecord, insertTestCommunity } from '@voucha/test-helpers'
import { reserveTestAiUsageMonths } from '@voucha/test-helpers/entities/ai-usage-monthly-partitions'
import {
  clearTestAiUsageOverflowFixture,
  countTestAiUsageRows,
  readTestAiUsageRetentionCursor,
  readTestAiUsageRollups,
  reserveTestAiUsageRetentionSweep,
  seedTestAiUsageCommunityRollup,
} from '@voucha/test-helpers/entities/ai-usage-rollups'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { cleanupAiUsageRecords } from './cleanup-ai-usage.mts'

describe('AI usage monthly fold overflow', () => {
  let releaseSweep: (() => Promise<void>) | undefined
  // no-mistakes-timeout-reason: this advisory lock serializes real retention cursor tests across forks.
  beforeAll(async () => {
    releaseSweep = await reserveTestAiUsageRetentionSweep()
  }, 30_000)
  afterAll(async () => {
    await releaseSweep?.()
  })

  it('rolls back deletion and checkpoint if a stored monthly BIGINT sum overflows', async () => {
    const year = 8700 + randomInt(600)
    const monthStart = `${year}-01-01`
    const rawAt = Date.UTC(year, 0, 2, 12)
    const releaseMonths = await reserveTestAiUsageMonths([new Date(rawAt)])
    const ownedIds: string[] = []
    const ownedCommunityIds: string[] = []
    onTestFinished(() => releaseMonths(ownedIds, ownedCommunityIds))
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    ownedCommunityIds.push(community.id)
    const rawId = await insertTestAiUsageRecord({
      id: `${timestampToUuidv7LowerBound(rawAt).slice(0, 24)}${randomBytes(6).toString('hex')}`,
      communityId: community.id,
      costMicrounits: 10,
    })
    ownedIds.push(rawId)
    const nearMax = (9_223_372_036_854_775_807n - 7n).toString()
    await seedTestAiUsageCommunityRollup(community.id, monthStart, nearMax)
    const before = await readTestAiUsageRollups(community.id, monthStart)
    const cursorBefore = await readTestAiUsageRetentionCursor()
    try {
      await expect(
        cleanupAiUsageRecords({
          now: new Date(rawAt + 181 * 86_400_000),
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
