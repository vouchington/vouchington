import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import {
  DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD,
  getAiGeneratedConfidenceThreshold,
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

  it('falls back to the default when override is above range', async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, { ai_generated_confidence_threshold: 1.5 })
    expect(getAiGeneratedConfidenceThreshold()).toBe(DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD)
  })

  it('falls back to the default when override is below range', async () => {
    overrideDynamicConfigFieldsForTest(moderationConfig, { ai_generated_confidence_threshold: -1 })
    expect(getAiGeneratedConfidenceThreshold()).toBe(DEFAULT_AI_GENERATED_CONFIDENCE_THRESHOLD)
  })
})
