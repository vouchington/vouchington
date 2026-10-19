import { describe, expect, it } from 'vitest'
import { validateAutotaggerPaidLimitsConfig } from './autotagger-paid-limits-validation.mts'
import { DynamicConfigValidationError } from 'valkyries/dynamic-config'
import { validateRequestSigningModeConfig } from './product-config-validators.mts'

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
