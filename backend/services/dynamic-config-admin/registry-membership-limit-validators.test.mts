import { describe, expect, it } from 'vitest'
import { autotaggerPaidLimitsConfig } from '@services/autotagger/limits-config'
import { manualTagLimitConfig } from '@services/tag-limits/config'
import { rateLimitConfig } from '@services/user-rate-limits/config'
import { getDynamicConfigRegistryEntry } from './registry.mts'

describe('membership limit registry validation', () => {
  it('rejects user rate-limit thresholds that decrease at a higher trust tier', () => {
    const entry = getDynamicConfigRegistryEntry('rate-limit-thresholds')

    expect(() =>
      entry?.validate?.({
        ...(rateLimitConfig.defaultFields as Record<string, number>),
        write_tier3: 29,
      }),
    ).toThrow('User rate-limit thresholds must not decrease: write_tier2 <= write_tier3')
  })

  it('rejects equal API thresholds because paid membership must increase an allowance', () => {
    const entry = getDynamicConfigRegistryEntry('rate-limit-thresholds')
    const defaults = rateLimitConfig.defaultFields as Record<string, number>

    expect(() =>
      entry?.validate?.({
        ...defaults,
        ...Object.fromEntries(
          ['read', 'write', 'sensitive'].flatMap(category =>
            Array.from({ length: 6 }, (_, tier) => [`${category}_tier${tier}`, 10]),
          ),
        ),
      }),
    ).toThrow('User rate-limit thresholds must increase for at least one paid trust tier')
  })

  it('rejects manual tag limits that decrease for a paid plan', () => {
    const entry = getDynamicConfigRegistryEntry('manual-tag-limits')

    expect(() =>
      entry?.validate?.({
        ...(manualTagLimitConfig.defaultFields as Record<string, number>),
        plus: 2,
      }),
    ).toThrow('Membership limits must satisfy free < plus < pro')
  })

  it('rejects autotagger limits that decrease for a paid plan', () => {
    const entry = getDynamicConfigRegistryEntry('autotagger-paid-limits')

    expect(() =>
      entry?.validate?.({
        ...(autotaggerPaidLimitsConfig.defaultFields as Record<string, boolean | number>),
        rss_collaborative_pro_max_topics: 2,
      }),
    ).toThrow(
      'RSS collaborative topic caps must satisfy rss_collaborative_plus_max_topics <= rss_collaborative_pro_max_topics',
    )
  })

  it('rejects enabling post autotagging for free-tier authors', () => {
    const entry = getDynamicConfigRegistryEntry('autotagger-paid-limits')

    expect(() =>
      entry?.validate?.({
        ...(autotaggerPaidLimitsConfig.defaultFields as Record<string, boolean | number>),
        post_free_max_topics: 1,
      }),
    ).toThrow('Free-tier post autotagging must remain disabled')
  })
})
