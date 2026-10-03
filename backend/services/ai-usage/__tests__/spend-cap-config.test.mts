import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it } from 'vitest'
import { getSpendCapFields, spendCapConfig } from '../spend-cap-config.mts'

describe('getSpendCapFields', () => {
  it('returns the $10/day default when Valkey has no override', async () => {
    await spendCapConfig.waitForInitialization()

    const fields = getSpendCapFields()

    expect(fields).toEqual({ enabled: true, daily_cap_microunits: 10_000_000 })
  })

  it('reflects an overridden cap after setField', async () => {
    await spendCapConfig.waitForInitialization()

    const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, {
      daily_cap_microunits: 5_000_000,
    })
    try {
      expect(getSpendCapFields().daily_cap_microunits).toBe(5_000_000)
    } finally {
      restore()
    }
  })

  it('reflects enabled: false after setField', async () => {
    await spendCapConfig.waitForInitialization()

    const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    try {
      expect(getSpendCapFields().enabled).toBe(false)
    } finally {
      restore()
    }
  })
})
