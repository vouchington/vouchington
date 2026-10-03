import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  insertLegacyContributionAdmissionConsumptionForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { contributionLimitConfig } from '@services/contribution-gating/limits-config'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'

describe('MCP recommendation capacity envelope', () => {
  beforeAll(async () => {
    await contributionLimitConfig.waitForInitialization()
    contributionLimitConfig.unsubscribe()
  })
  afterAll(async () => {
    await closeScopedDynamicConfigContext([contributionLimitConfig])
  })
  it('reports exhausted owner capacity as non-retryable without inventing a delay', async () => {
    const user = { ...(await createTestUser()), membership_plan: 'plus' as const }
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      topic_recommendation_plus_short_limit: 1,
    })
    await insertLegacyContributionAdmissionConsumptionForTest({
      actorId: user.id,
      source: 'topic_recommendation',
    })
    const slug = `quota-${crypto.randomUUID()}`
    const result = JSON.parse(
      await callRejectedMcpTool(
        user,
        'create_topic_recommendation',
        {
          idempotency_key: crypto.randomUUID(),
          markdown: 'Topic',
          topic_title: slug,
          topic_slug: slug,
        },
        ['topic-recommendations:read', 'topic-recommendations:write'],
      ),
    )
    expect(result.error).toMatchObject({
      status: 429,
      code: 'CONTRIBUTION_QUOTA_EXCEEDED',
      retryable: false,
    })
    expect(result.error).not.toHaveProperty('retryAfterSeconds')
  })
})
