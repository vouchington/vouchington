import { randomInt, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import {
  isTestAiUsagePartitionAttached,
  readTestAiUsageIdsForMonth,
  reserveTestAiUsageMonths,
  testAiUsageCandidate,
} from '@voucha/test-helpers/entities/ai-usage-monthly-partitions'
import {
  probeBlockedAiUsageRetirement,
  retireTestAiUsagePartition,
  retireTestAiUsagePartitionDuringWrite,
  withTestAiUsagePreparationFault,
} from '@voucha/test-helpers/entities/ai-usage-partition-retirement'
import {
  hasTestAiUsageResponseKey,
  insertTestAiUsageResponseKey,
  reserveTestAiUsageRetentionSweep,
} from '@voucha/test-helpers/entities/ai-usage-rollups'
import { retireMonthlyPartitionCandidate } from '@data-stores/psql/migration-runner/monthly-partitions'
import { getDateFromUUIDv7, mintUUIDv7 } from '../../../modules/utils/ids.mts'
import { recordAiUsage } from '../record.mts'
import { getCommunityAiCostTotals } from '../totals.mts'
import { prepareAiUsageMonth } from '@data-stores/psql/ai-usage-monthly-partition'

describe('backdated AI usage on retired monthly history', () => {
  it('propagates a partition creator failure without changing shared schema', async () => {
    const createdAt = new Date(Date.UTC(2000 + randomInt(20), randomInt(12), 12, 12))
    const partition = `ai_usage_records__p_${createdAt.getUTCFullYear()}_${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    await withTestAiUsagePreparationFault(partition, 'creator', async () => {
      await expect(prepareAiUsageMonth(createdAt)).rejects.toThrow(
        'Injected AI usage partition creator failure',
      )
    })
  })

  it('rejects a present but unattached month without recording usage', async () => {
    const createdAt = new Date(Date.UTC(2000 + randomInt(20), randomInt(12), 12, 12))
    const partition = `ai_usage_records__p_${createdAt.getUTCFullYear()}_${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    const agentSlug = `test-detached-month-${randomUUID()}`
    await withTestAiUsagePreparationFault(partition, 'present-unattached', async () => {
      await expect(
        recordAiUsage({
          createdAt,
          agentSlug,
          provider: 'openai',
          transport: 'direct',
          model: 'gpt-6-luna',
          serviceTier: 'flex',
          usage: {
            inputTokens: 10,
            cacheReadTokens: 0,
            cacheWrite5mTokens: 0,
            cacheWrite1hTokens: 0,
            outputTokens: 2,
            reasoningOutputTokens: 0,
          },
        }),
      ).rejects.toMatchObject({
        name: 'AiUsageMonthPreparationError',
        missing: false,
        message: `AI usage month ${partition} was not attached after preparation`,
      })
    })
    expect(await readTestAiUsageIdsForMonth(createdAt, agentSlug)).toEqual([])
  })

  it('retries when retirement commits after the attached-month probe', async () => {
    const releaseSweep = await reserveTestAiUsageRetentionSweep()
    onTestFinished(releaseSweep)
    const createdAt = new Date(Date.UTC(2000 + randomInt(20), randomInt(12), 12, 12))
    const releaseMonth = await reserveTestAiUsageMonths([createdAt])
    const agentSlug = `test-retirement-race-${randomUUID()}`
    onTestFinished(async () => {
      const ids = await readTestAiUsageIdsForMonth(createdAt, agentSlug)
      await releaseMonth(ids)
    })
    const partition = `ai_usage_records__p_${createdAt.getUTCFullYear()}_${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    await retireTestAiUsagePartitionDuringWrite(testAiUsageCandidate(partition), () =>
      recordAiUsage({
        createdAt,
        agentSlug,
        provider: 'openai',
        transport: 'direct',
        model: 'gpt-6-luna',
        serviceTier: 'flex',
        usage: {
          inputTokens: 10,
          cacheReadTokens: 0,
          cacheWrite5mTokens: 0,
          cacheWrite1hTokens: 0,
          outputTokens: 2,
          reasoningOutputTokens: 0,
        },
      }),
    )
    const ids = await readTestAiUsageIdsForMonth(createdAt, agentSlug)
    expect(ids).toHaveLength(1)
    expect(getDateFromUUIDv7(ids[0]!)?.toISOString().slice(0, 10)).toBe(
      createdAt.toISOString().slice(0, 10),
    )
    expect(await isTestAiUsagePartitionAttached(partition)).toBe(true)
  })

  it('records concurrent backdated and ordinary usage after retiring the historical month', async () => {
    const releaseSweep = await reserveTestAiUsageRetentionSweep()
    onTestFinished(releaseSweep)
    const createdAt = new Date(Date.UTC(2000 + randomInt(20), randomInt(12), 12, 12))
    const normalAt = new Date()
    const releaseMonth = await reserveTestAiUsageMonths([createdAt])
    const agentSlug = `test-tier-order-${randomUUID()}`
    onTestFinished(async () => {
      const backdatedIds = await readTestAiUsageIdsForMonth(createdAt, `${agentSlug}-backdated`)
      const secondBackdatedIds = await readTestAiUsageIdsForMonth(
        createdAt,
        `${agentSlug}-backdated-second`,
      )
      const ordinaryIds = await readTestAiUsageIdsForMonth(normalAt, `${agentSlug}-ordinary`)
      await releaseMonth([...backdatedIds, ...secondBackdatedIds, ...ordinaryIds])
    })
    const partition = `ai_usage_records__p_${createdAt.getUTCFullYear()}_${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    const candidate = testAiUsageCandidate(partition)
    await retireTestAiUsagePartition(candidate)
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
    await Promise.all([
      recordAiUsage({ ...common, createdAt, agentSlug: `${agentSlug}-backdated` }),
      recordAiUsage({ ...common, createdAt, agentSlug: `${agentSlug}-backdated-second` }),
      recordAiUsage({ ...common, agentSlug: `${agentSlug}-ordinary` }),
    ])
    const backdatedIds = await readTestAiUsageIdsForMonth(createdAt, `${agentSlug}-backdated`)
    const secondBackdatedIds = await readTestAiUsageIdsForMonth(
      createdAt,
      `${agentSlug}-backdated-second`,
    )
    const ordinaryIds = await readTestAiUsageIdsForMonth(normalAt, `${agentSlug}-ordinary`)
    expect(backdatedIds).toHaveLength(1)
    expect(secondBackdatedIds).toHaveLength(1)
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
    await retireTestAiUsagePartition(candidate)
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
