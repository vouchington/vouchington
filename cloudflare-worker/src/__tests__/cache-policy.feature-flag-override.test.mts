import { describe } from 'vitest'
import { registerCachePolicyBypassSignalTests } from '../../test-helpers/src/cache-policy-bypass-signal-tests.mts'

describe('feature-flag override cookie cache policy', () => {
  registerCachePolicyBypassSignalTests({
    bypassTitle:
      'bypasses cache when a feature-flag override cookie is present, before anonymous or bot caching',
    negativeTitle: 'does not bypass cache when no feature-flag override cookie is present',
    firstBypass: {
      pathname: '/blog',
      botTier: null,
      hasFeatureFlagOverrideCookie: true,
      hasReferralAttributionSignal: false,
    },
    secondBypass: {
      pathname: '/blog',
      botTier: 'known',
      hasFeatureFlagOverrideCookie: true,
      hasReferralAttributionSignal: false,
    },
  })
})
