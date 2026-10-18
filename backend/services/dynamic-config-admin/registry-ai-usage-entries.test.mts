import { describe, expect, it } from 'vitest'
import { SPEND_CAP_MAX_VALUES } from '@services/ai-usage/spend-cap-config'
import { validateDynamicConfigUpdate } from 'valkyries/dynamic-config'
import { normalizeFields } from '@vouchington/dynamic-config'
import { dynamicConfigRegistry } from './registry.mts'

describe('registered AI spend-cap field rules', () => {
  it('allows the zero-spend kill switch and enforces the configured integer bounds', () => {
    const entry = dynamicConfigRegistry.get('ai-spend-cap')
    if (!entry) throw new Error('ai-spend-cap registry entry missing')

    const current = normalizeFields(entry, entry.config.defaultFields)
    expect(
      validateDynamicConfigUpdate(entry, current, { daily_cap_microunits: 0 }).changes,
    ).toMatchObject({ daily_cap_microunits: 0 })

    for (const value of [-1, 1.5, SPEND_CAP_MAX_VALUES.daily_cap_microunits + 1]) {
      expect(() =>
        validateDynamicConfigUpdate(entry, current, { daily_cap_microunits: value }),
      ).toThrow('daily_cap_microunits')
    }
  })
})
