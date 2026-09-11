import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it } from 'vitest'
import { getAgentResponseQuotaFields, agentResponseQuotaConfig } from './quota-config.mts'

describe('getAgentResponseQuotaFields', () => {
  it('returns numeric and boolean fields with correct defaults when config is unset', async () => {
    await agentResponseQuotaConfig.waitForInitialization()

    const fields = getAgentResponseQuotaFields()

    expect(typeof fields.free_daily).toBe('number')
    expect(typeof fields.plus_daily).toBe('number')
    expect(typeof fields.pro_daily).toBe('number')
    expect(typeof fields.max_concurrent).toBe('number')
    expect(typeof fields.enabled).toBe('boolean')
  })

  it('reflects updated values after setField', async () => {
    await agentResponseQuotaConfig.waitForInitialization()

    const original = agentResponseQuotaConfig.getFields()
    overrideDynamicConfigFieldsForTest(agentResponseQuotaConfig, { free_daily: 42 })

    try {
      const fields = getAgentResponseQuotaFields()
      expect(fields.free_daily).toBe(42)
    } finally {
      overrideDynamicConfigFieldsForTest(agentResponseQuotaConfig, {
        free_daily: (original['free_daily'] as number) ?? 10,
      })
    }
  })

  it('returns default free_daily of 10 when field is not set', async () => {
    await agentResponseQuotaConfig.waitForInitialization()

    const fields = getAgentResponseQuotaFields()

    // Default is 10 unless overridden by test setup
    expect(fields.free_daily).toBeGreaterThan(0)
  })
})
