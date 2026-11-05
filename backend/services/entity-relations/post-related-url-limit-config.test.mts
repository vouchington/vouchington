import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  getRelationTypeLimit,
  relationLimitsConfig,
  relationLimitsMaxValues,
} from './relation-limits-config.mts'

const table = 'relation__post__related__url'

describe('post related URL limit configuration', () => {
  it('accepts the hard maximum and falls back to the default above it', async () => {
    await relationLimitsConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(relationLimitsConfig, {
      post_related_url: 10000,
    })
    onTestFinished(restore)
    expect(relationLimitsMaxValues.post_related_url).toBe(10000)
    expect(getRelationTypeLimit(table)).toBe(10000)
    restore()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 10001 }),
    )
    expect(getRelationTypeLimit(table)).toBe(1000)
  })

  it('uses the default for a non-positive configured value', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 0 }),
    )
    expect(getRelationTypeLimit(table)).toBe(1000)
  })
})
