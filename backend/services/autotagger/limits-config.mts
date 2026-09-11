import { DynamicConfig } from '@data-stores/valkey'

// Paid-tier caps for the autotagger LLM agent (#8246). Separate from `manual-tag-limits`
// (`@services/tag-limits`) -- that namespace caps human-added tags per relation; this one caps
// how many topics the autotagger itself may add, split by post authorship tier and by the two
// independent RSS enrichment tiers (discoverable-source LLM pass, paid-follower collaborative
// pass). Kept as its own namespace because it governs async worker/LLM behavior, not a
// synchronous per-request human write path.
export type AutotaggerPaidLimitsFields = {
  enabled: boolean
  post_free_max_topics: number
  post_plus_max_topics: number
  post_pro_max_topics: number
  rss_discoverable_llm_max_topics: number
  rss_collaborative_plus_max_topics: number
  rss_collaborative_pro_max_topics: number
}

const DEFAULTS: AutotaggerPaidLimitsFields = {
  enabled: true,
  post_free_max_topics: 0,
  post_plus_max_topics: 5,
  post_pro_max_topics: 10,
  rss_discoverable_llm_max_topics: 3,
  rss_collaborative_plus_max_topics: 3,
  rss_collaborative_pro_max_topics: 4,
}

export const AUTOTAGGER_PAID_LIMITS_CONFIG_KEY = 'autotagger-paid-limits'

export const autotaggerPaidLimitsConfig = new DynamicConfig({
  key: AUTOTAGGER_PAID_LIMITS_CONFIG_KEY,
  fieldTypes: {
    enabled: 'boolean',
    post_free_max_topics: 'number',
    post_plus_max_topics: 'number',
    post_pro_max_topics: 'number',
    rss_discoverable_llm_max_topics: 'number',
    rss_collaborative_plus_max_topics: 'number',
    rss_collaborative_pro_max_topics: 'number',
  },
  defaultFields: DEFAULTS,
})

export function getAutotaggerPaidLimitsFields(): AutotaggerPaidLimitsFields {
  const fields = autotaggerPaidLimitsConfig.getFields()
  return {
    enabled: (fields['enabled'] as boolean | undefined) ?? DEFAULTS.enabled,
    post_free_max_topics:
      (fields['post_free_max_topics'] as number | undefined) ?? DEFAULTS.post_free_max_topics,
    post_plus_max_topics:
      (fields['post_plus_max_topics'] as number | undefined) ?? DEFAULTS.post_plus_max_topics,
    post_pro_max_topics:
      (fields['post_pro_max_topics'] as number | undefined) ?? DEFAULTS.post_pro_max_topics,
    rss_discoverable_llm_max_topics:
      (fields['rss_discoverable_llm_max_topics'] as number | undefined) ??
      DEFAULTS.rss_discoverable_llm_max_topics,
    rss_collaborative_plus_max_topics:
      (fields['rss_collaborative_plus_max_topics'] as number | undefined) ??
      DEFAULTS.rss_collaborative_plus_max_topics,
    rss_collaborative_pro_max_topics:
      (fields['rss_collaborative_pro_max_topics'] as number | undefined) ??
      DEFAULTS.rss_collaborative_pro_max_topics,
  }
}
