import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, it, expect } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  assertWithinAgentResponseQuota,
  assertWithinConcurrentAgentResponseLimit,
} from './quota.mts'
import {
  AGENT_RESPONSE_QUOTA_EXCEEDED,
  AGENT_RESPONSE_MAX_CONCURRENT,
  AGENT_RESPONSE_DISABLED,
} from '@modules/on-error/error-codes'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { agentResponseQuotaConfig } from './quota-config.mts'

async function resetAgentResponseQuota(userId: string): Promise<void> {
  const limiter = new RateLimiter({ prefix: 'agent-response-quota', ttlSeconds: 24 * 60 * 60 })
  await limiter.delete(userId)
}

describe('assertWithinAgentResponseQuota', () => {
  it('allows admin users regardless of config', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: ['administrator'] as const, membership_plan: null }
    await expect(assertWithinAgentResponseQuota(user)).resolves.toBeUndefined()
  })

  it('throws AGENT_RESPONSE_DISABLED when config.enabled is false', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: [] as const, membership_plan: null }

    await agentResponseQuotaConfig.waitForInitialization()
    const original = agentResponseQuotaConfig.getFields()
    overrideDynamicConfigFieldsForTest(agentResponseQuotaConfig, { enabled: false })

    try {
      await expect(assertWithinAgentResponseQuota(user)).rejects.toMatchObject({
        code: AGENT_RESPONSE_DISABLED,
        status: 503,
      })
    } finally {
      overrideDynamicConfigFieldsForTest(agentResponseQuotaConfig, {
        enabled: original['enabled'] ?? true,
      })
    }
  })

  it('allows free user under daily limit', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: [] as const, membership_plan: null }
    await resetAgentResponseQuota(userId)

    await expect(assertWithinAgentResponseQuota(user)).resolves.toBeUndefined()
  })

  it('throws AGENT_RESPONSE_QUOTA_EXCEEDED when free daily limit is exceeded', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: [] as const, membership_plan: null }
    await resetAgentResponseQuota(userId)

    await agentResponseQuotaConfig.waitForInitialization()
    overrideDynamicConfigFieldsForTest(agentResponseQuotaConfig, { free_daily: 1 })

    try {
      // First call should succeed
      await assertWithinAgentResponseQuota(user)
      // Second call should exceed the limit
      await expect(assertWithinAgentResponseQuota(user)).rejects.toMatchObject({
        code: AGENT_RESPONSE_QUOTA_EXCEEDED,
        status: 429,
      })
    } finally {
      overrideDynamicConfigFieldsForTest(agentResponseQuotaConfig, { free_daily: 10 })
    }
  })

  it('allows plus user up to plus limit', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: [] as const, membership_plan: 'plus' as const }
    await resetAgentResponseQuota(userId)

    await expect(assertWithinAgentResponseQuota(user)).resolves.toBeUndefined()
  })

  it('allows pro user up to pro limit', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: [] as const, membership_plan: 'pro' as const }
    await resetAgentResponseQuota(userId)

    await expect(assertWithinAgentResponseQuota(user)).resolves.toBeUndefined()
  })
})

describe('assertWithinConcurrentAgentResponseLimit', () => {
  it('allows admin users regardless of running count', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: ['administrator'] as const, membership_plan: null }
    await expect(assertWithinConcurrentAgentResponseLimit(user)).resolves.toBeUndefined()
  })

  it('allows user with zero running agent responses', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: [] as const, membership_plan: null }
    await expect(assertWithinConcurrentAgentResponseLimit(user)).resolves.toBeUndefined()
  })

  it('throws AGENT_RESPONSE_MAX_CONCURRENT when at max_concurrent limit', async () => {
    const userId = uuidv7()
    const user = { id: userId, roles: [] as const, membership_plan: null }

    await agentResponseQuotaConfig.waitForInitialization()
    overrideDynamicConfigFieldsForTest(agentResponseQuotaConfig, { max_concurrent: 0 })

    try {
      await expect(assertWithinConcurrentAgentResponseLimit(user)).rejects.toMatchObject({
        code: AGENT_RESPONSE_MAX_CONCURRENT,
        status: 409,
      })
    } finally {
      overrideDynamicConfigFieldsForTest(agentResponseQuotaConfig, { max_concurrent: 4 })
    }
  })
})
