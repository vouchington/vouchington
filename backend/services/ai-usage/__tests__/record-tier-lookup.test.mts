import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  countAiUsageRecordsForAgent,
  createTestPost,
  createTestUser,
  findAiUsageRecordForPost,
} from '@voucha/test-helpers'
import { runWithConcurrentLookupRegistration } from '@voucha/test-helpers/lookup-registration-race'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import type { PrivateUser } from '@services/users/types'
import { recordAiUsage } from '../record.mts'

describe('recordAiUsage service tier lookup', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('resolves a new service_tier when a concurrent first call commits first and reads without writing afterward', async () => {
    const post = await createTestPost({ user })
    const agentSlug = `test-usage-tier-race-${randomUUID()}`
    const serviceTier = `future-tier-${randomUUID()}`
    const options = {
      postId: post.id,
      agentSlug,
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: 'gpt-6-luna',
      serviceTier,
      usage: {
        inputTokens: 14,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 6,
        reasoningOutputTokens: 0,
        reportedCostUsd: 0.001,
      },
    }

    const {
      result: { queries: firstQueries },
    } = await runWithConcurrentLookupRegistration('ai_service_tiers', serviceTier, () =>
      withCapturedTestQueries(() => recordAiUsage(options)),
    )
    const persisted = await findAiUsageRecordForPost(post.id, agentSlug)
    expect(persisted?.service_tier_id).toBe(serviceTier)
    expect(countCapturedQueriesByAnnotation(firstQueries, 'findAiUsageTier')).toBe(1)
    expect(countCapturedQueriesByAnnotation(firstQueries, 'registerAiUsageTier')).toBe(1)
    expect(countCapturedQueriesByAnnotation(firstQueries, 'findRegisteredAiUsageTier')).toBe(1)

    const { queries: secondQueries } = await withCapturedTestQueries(() => recordAiUsage(options))
    await expect(
      countAiUsageRecordsForAgent(agentSlug, { inputTokens: 14, outputTokens: 6 }),
    ).resolves.toBe(2)
    expect(countCapturedQueriesByAnnotation(secondQueries, 'findAiUsageTier')).toBe(1)
    expect(countCapturedQueriesByAnnotation(secondQueries, 'registerAiUsageTier')).toBe(0)
    expect(countCapturedQueriesByAnnotation(secondQueries, 'findRegisteredAiUsageTier')).toBe(0)
  })
})
