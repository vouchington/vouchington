import { randomInt, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import {
  isTestAiUsagePartitionAttached,
  probeBlockedAiUsageRetirement,
  readTestAiUsageIdsForMonth,
  reserveTestAiUsageMonths,
  testAiUsageCandidate,
} from '@voucha/test-helpers/entities/ai-usage-monthly-partitions'
import { runAiUsageTierOrderRace } from '@voucha/test-helpers/entities/ai-usage-tier-lock-order'
import {
  hasTestAiUsageResponseKey,
  insertTestAiUsageResponseKey,
  reserveTestAiUsageRetentionSweep,
} from '@voucha/test-helpers/entities/ai-usage-rollups'
import { retireMonthlyPartitionCandidate } from '@data-stores/psql/migration-runner/monthly-partitions'
import { getDateFromUUIDv7, mintUUIDv7 } from '../../../modules/utils/ids.mts'
import { recordAiUsage } from '../record.mts'
import { getCommunityAiCostTotals } from '../totals.mts'

describe('backdated AI usage on retired monthly history', () => {
  it('registers a shared tier before either ordinary or backdated ledger table locks', async () => {
    const releaseSweep = await reserveTestAiUsageRetentionSweep()
    onTestFinished(releaseSweep)
    const createdAt = new Date(Date.UTC(2000 + randomInt(20), randomInt(12), 12, 12))
    const normalAt = new Date()
    const releaseMonth = await reserveTestAiUsageMonths([createdAt])
    const agentSlug = `test-tier-order-${randomUUID()}`
    onTestFinished(async () => {
      const backdatedIds = await readTestAiUsageIdsForMonth(createdAt, `${agentSlug}-backdated`)
      const ordinaryIds = await readTestAiUsageIdsForMonth(normalAt, `${agentSlug}-ordinary`)
      await releaseMonth([...backdatedIds, ...ordinaryIds])
    })
    const partition = `ai_usage_records__p_${createdAt.getUTCFullYear()}_${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    const candidate = testAiUsageCandidate(partition)
    expect(await retireMonthlyPartitionCandidate(candidate, new Date(), 1)).toMatchObject({
      outcome: 'dropped',
    })
    const usage = {
      inputTokens: 10,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 2,
      reasoningOutputTokens: 0,
    }
    const common = {
      provider: 'openai',
      transport: 'direct',
      model: 'gpt-6-luna',
      serviceTier: 'flex',
      usage,
    }
    await runAiUsageTierOrderRace(
      query => recordAiUsage({ ...common, query, createdAt, agentSlug: `${agentSlug}-backdated` }),
      query => recordAiUsage({ ...common, query, agentSlug: `${agentSlug}-ordinary` }),
    )
    const backdatedIds = await readTestAiUsageIdsForMonth(createdAt, `${agentSlug}-backdated`)
    const ordinaryIds = await readTestAiUsageIdsForMonth(normalAt, `${agentSlug}-ordinary`)
    expect(backdatedIds).toHaveLength(1)
    expect(ordinaryIds).toHaveLength(1)
  })

  it('recreates only its exact month and keeps the response replay identity while raw usage remains', async () => {
    const releaseSweep = await reserveTestAiUsageRetentionSweep()
    onTestFinished(releaseSweep)
    const createdAt = new Date(Date.UTC(2000 + randomInt(20), randomInt(12), 12, 12))
    const releaseMonth = await reserveTestAiUsageMonths([createdAt])
    const ownedIds: string[] = []
    const ownedCommunityIds: string[] = []
    onTestFinished(() => releaseMonth(ownedIds, ownedCommunityIds))
    const partition = `ai_usage_records__p_${createdAt.getUTCFullYear()}_${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    const candidate = testAiUsageCandidate(partition)
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    ownedCommunityIds.push(community.id)
    expect(await probeBlockedAiUsageRetirement(candidate, community.id)).toBe('55P03')
    expect(await probeBlockedAiUsageRetirement(candidate, null)).toBe('55P03')
    expect(await isTestAiUsagePartitionAttached(partition)).toBe(true)
    expect(await retireMonthlyPartitionCandidate(candidate, new Date(), 1)).toMatchObject({
      outcome: 'dropped',
    })
    const agentSlug = `test-backdated-${randomUUID()}`
    await recordAiUsage({
      createdAt,
      communityId: community.id,
      agentSlug,
      provider: 'openai',
      transport: 'direct',
      model: 'gpt-6-luna',
      serviceTier: 'flex',
      usage: {
        inputTokens: 200,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 100,
        reasoningOutputTokens: 0,
      },
    })
    const ids = await readTestAiUsageIdsForMonth(createdAt, agentSlug)
    expect(ids).toHaveLength(1)
    ownedIds.push(ids[0]!)
    expect(getDateFromUUIDv7(ids[0]!)?.toISOString().slice(0, 10)).toBe(
      createdAt.toISOString().slice(0, 10),
    )
    const responseId = await insertTestAiUsageResponseKey(mintUUIDv7(), ids[0]!)
    expect(await retireMonthlyPartitionCandidate(candidate, new Date(), 1)).toMatchObject({
      outcome: 'refused',
      reason: 'in-flight',
    })
    expect(await hasTestAiUsageResponseKey(responseId)).toBe(true)
    let after: string | undefined
    let ownedTotal:
      | Awaited<ReturnType<typeof getCommunityAiCostTotals>>['results'][number]
      | undefined
    for (;;) {
      const page = await getCommunityAiCostTotals({ limit: 100, after })
      ownedTotal = page.results.find(row => row.community_id === community.id)
      if (ownedTotal) break
      if (!page.page_info.has_next_page || !page.page_info.end_cursor) {
        throw new Error('Owned community was absent from AI usage totals')
      }
      after = page.page_info.end_cursor
    }
    expect(ownedTotal).toMatchObject({
      request_count: 1,
      total_cost: { amount: '35', currency: 'usd', scale: 6 },
    })
  })
})
