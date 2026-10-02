import { describe, expect, it } from 'vitest'
import { SPEND_CAP_MAX_VALUES, SPEND_CAP_MIN_VALUES } from '@services/ai-usage/spend-cap-config'
import { validateAutotaggerPaidLimitsConfig } from './autotagger-paid-limits-validation.mts'
import { DynamicConfigValidationError } from './namespace.mts'
import { validateSpendCapConfig } from './registry-ai-usage-validators.mts'
import { validateRequestSigningModeConfig } from './registry-validators.mts'

describe('validateRequestSigningModeConfig', () => {
  it.each(['off', 'observe', 'enforce'])('accepts valid mode %s', mode => {
    expect(() => validateRequestSigningModeConfig({ request_signing_mode: mode })).not.toThrow()
  })

  it('rejects an unrecognised mode', () => {
    expect(() => validateRequestSigningModeConfig({ request_signing_mode: 'invalid' })).toThrow(
      DynamicConfigValidationError,
    )
  })
})

describe('validateAutotaggerPaidLimitsConfig', () => {
  it('rejects missing or non-finite collaborative caps', () => {
    expect(() => validateAutotaggerPaidLimitsConfig({})).toThrow(DynamicConfigValidationError)
    expect(() =>
      validateAutotaggerPaidLimitsConfig({
        rss_collaborative_plus_max_topics: Number.NaN,
        rss_collaborative_pro_max_topics: 4,
      }),
    ).toThrow(DynamicConfigValidationError)
  })

  it('accepts collaborative follower caps where Plus does not exceed Pro', () => {
    expect(() =>
      validateAutotaggerPaidLimitsConfig({
        rss_collaborative_plus_max_topics: 3,
        rss_collaborative_pro_max_topics: 4,
      }),
    ).not.toThrow()
  })

  it('rejects collaborative follower caps where Plus exceeds Pro', () => {
    expect(() =>
      validateAutotaggerPaidLimitsConfig({
        rss_collaborative_plus_max_topics: 5,
        rss_collaborative_pro_max_topics: 4,
      }),
    ).toThrow(DynamicConfigValidationError)
  })
})

describe('validateSpendCapConfig', () => {
  it('accepts a value within bounds', () => {
    expect(() => validateSpendCapConfig({ daily_cap_microunits: 10_000_000 })).not.toThrow()
  })

  it('accepts zero -- the true kill switch, distinct from enabled: false', () => {
    expect(() => validateSpendCapConfig({ daily_cap_microunits: 0 })).not.toThrow()
  })

  it('rejects a negative value', () => {
    expect(() => validateSpendCapConfig({ daily_cap_microunits: -1 })).toThrow(
      DynamicConfigValidationError,
    )
  })

  it('rejects below the floor', () => {
    expect(() =>
      validateSpendCapConfig({
        daily_cap_microunits: SPEND_CAP_MIN_VALUES.daily_cap_microunits - 1,
      }),
    ).toThrow(DynamicConfigValidationError)
  })

  it('rejects above the ceiling', () => {
    expect(() =>
      validateSpendCapConfig({
        daily_cap_microunits: SPEND_CAP_MAX_VALUES.daily_cap_microunits + 1,
      }),
    ).toThrow(DynamicConfigValidationError)
  })

  it('rejects a non-integer', () => {
    expect(() => validateSpendCapConfig({ daily_cap_microunits: 1.5 })).toThrow(
      DynamicConfigValidationError,
    )
  })
})
