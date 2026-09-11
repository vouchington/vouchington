import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it } from 'vitest'
import { getOpenAiSpendCapFields, openAiSpendCapConfig } from '../spend-cap-config.mts'

describe('getOpenAiSpendCapFields', () => {
  it('returns the $10/day default when Valkey has no override', async () => {
    await openAiSpendCapConfig.waitForInitialization()

    const fields = getOpenAiSpendCapFields()

    expect(fields).toEqual({ enabled: true, daily_cap_microunits: 10_000_000 })
  })

  it('reflects an overridden cap after setField', async () => {
    await openAiSpendCapConfig.waitForInitialization()

    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      daily_cap_microunits: 5_000_000,
    })
    try {
      expect(getOpenAiSpendCapFields().daily_cap_microunits).toBe(5_000_000)
    } finally {
      restore()
    }
  })

  it('reflects enabled: false after setField', async () => {
    await openAiSpendCapConfig.waitForInitialization()

    const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
    try {
      expect(getOpenAiSpendCapFields().enabled).toBe(false)
    } finally {
      restore()
    }
  })
})
