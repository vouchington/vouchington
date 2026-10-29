import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dynamicConfigPrimaryValkeyClient } from '@data-stores/valkey/clients'
import {
  closeScopedDynamicConfigContext,
  createDynamicConfigForTest,
  createDynamicConfigTestKey,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import {
  getAiGeneratedConfidenceThreshold,
  getFreshAiGeneratedConfidenceThreshold,
  moderationConfig,
} from './config.mts'

describe('getAiGeneratedConfidenceThreshold', () => {
  beforeAll(async () => {
    await moderationConfig.waitForInitialization()
    moderationConfig.unsubscribe()
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, {
      ai_generated_confidence_threshold: 0.95,
    })
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([moderationConfig])
  })

  it('returns the default when no override is set', () => {
    expect(getAiGeneratedConfidenceThreshold()).toBe(0.95)
  })

  it('returns a valid DynamicConfig override', async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, {
      ai_generated_confidence_threshold: 0.97,
    })
    expect(getAiGeneratedConfidenceThreshold()).toBe(0.97)
  })

  it('reads an isolated DynamicConfig key directly from primary', async () => {
    const config = createDynamicConfigForTest({
      key: createDynamicConfigTestKey('moderation-threshold'),
      fieldTypes: { ai_generated_confidence_threshold: 'number' },
      defaultFields: {
        ai_generated_confidence_threshold: 0.95,
      },
    })
    try {
      await config.waitForInitialization()
      await dynamicConfigPrimaryValkeyClient.hset(config.key, {
        ai_generated_confidence_threshold: '0.973',
      })
      await expect(getFreshAiGeneratedConfidenceThreshold(config)).resolves.toBe(0.973)
      expect(config.getFields().ai_generated_confidence_threshold).toBe(0.95)
    } finally {
      await dynamicConfigPrimaryValkeyClient.unlink([config.key])
      await config.close()
    }
  })

  it('falls back to the default when override is above range', async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, { ai_generated_confidence_threshold: 1.5 })
    expect(getAiGeneratedConfidenceThreshold()).toBe(0.95)
  })

  it('falls back to the default when override is below range', async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, { ai_generated_confidence_threshold: -1 })
    expect(getAiGeneratedConfidenceThreshold()).toBe(0.95)
  })
})
