import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DynamicConfig } from '@data-stores/valkey'
import { dynamicConfigPrimaryValkeyClient } from '@data-stores/valkey/clients'
import {
  closeScopedDynamicConfigContext,
  createDynamicConfigTestKey,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import {
  DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD,
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
      ai_generated_confidence_threshold: DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD,
    })
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([moderationConfig])
  })

  it('returns the default when no override is set', () => {
    expect(getAiGeneratedConfidenceThreshold()).toBe(DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD)
  })

  it('returns a valid DynamicConfig override', async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, {
      ai_generated_confidence_threshold: 0.97,
    })
    expect(getAiGeneratedConfidenceThreshold()).toBe(0.97)
  })

  it('reads an isolated DynamicConfig key directly from primary', async () => {
    const config = new DynamicConfig({
      key: createDynamicConfigTestKey('moderation-threshold'),
      fieldTypes: { ai_generated_confidence_threshold: 'number' },
      defaultFields: {
        ai_generated_confidence_threshold: DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD,
      },
    })
    try {
      await config.waitForInitialization()
      await dynamicConfigPrimaryValkeyClient.hset(config.key, {
        ai_generated_confidence_threshold: '0.973',
      })
      await expect(getFreshAiGeneratedConfidenceThreshold(config)).resolves.toBe(0.973)
      expect(config.getFields().ai_generated_confidence_threshold).toBe(
        DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD,
      )
    } finally {
      await dynamicConfigPrimaryValkeyClient.unlink([config.key])
      await config.close()
    }
  })

  it('falls back to the default when override is above range', async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, { ai_generated_confidence_threshold: 1.5 })
    expect(getAiGeneratedConfidenceThreshold()).toBe(DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD)
  })

  it('falls back to the default when override is below range', async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, { ai_generated_confidence_threshold: -1 })
    expect(getAiGeneratedConfidenceThreshold()).toBe(DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD)
  })
})
