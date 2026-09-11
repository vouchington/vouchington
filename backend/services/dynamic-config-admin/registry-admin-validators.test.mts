import { describe, expect, it } from 'vitest'
import { getDynamicConfigRegistryEntry } from './registry.mts'
import { contributionLimitConfig } from '@services/contribution-gating/limits-config'
import { RSS_FEED_CRAWL_MAX_VALUES } from '@services/rss-feeds/crawl-config'

const VALID_RSS_FEED_CRAWL_FIELDS = {
  enabled: true,
  ignore_robots_txt: true,
  tier1_sla_ms: 1,
  tier2_sla_ms: 2,
  tier3_sla_ms: 3,
  tier4_sla_ms: 4,
  tier5_sla_ms: 5,
  capacity_budget: 100,
}

describe('dynamic-config-admin registry validators', () => {
  it('rejects non-positive rate limit numbers', () => {
    const entry = getDynamicConfigRegistryEntry('rate-limit-thresholds')

    expect(entry?.fields).not.toHaveProperty('enabled')
    expect(() => entry?.validate?.({ read_tier0: 0 })).toThrow(
      'Field read_tier0 must be a positive finite number',
    )
  })

  it('rejects reCAPTCHA thresholds outside the score range', () => {
    const entry = getDynamicConfigRegistryEntry('recaptcha-config')

    expect(() => entry?.validate?.({ enabled: true, block_threshold: 2 })).toThrow(
      'Field block_threshold must be a number between 0 and 1',
    )
  })

  it('rejects post content limits below their minimums', () => {
    const entry = getDynamicConfigRegistryEntry('post-content-limits-config')

    expect(() =>
      entry?.validate?.({
        data_point_topic_ids_max_items: 1,
        review_topic_ratings_max_items: 1,
      }),
    ).toThrow('Field review_topic_ratings_max_items must be an integer between 2 and 100')
  })

  it('registers the post related URL summary bound', () => {
    const entry = getDynamicConfigRegistryEntry('post-related-url-display-config')

    expect(entry?.fields.summary_limit).toMatchObject({
      min_value: 1,
      max_value: 10,
      integer: true,
    })
  })

  it('rejects contribution limits below disabled sentinel', () => {
    const entry = getDynamicConfigRegistryEntry('contribution-rate-limits')

    expect(() =>
      entry?.validate?.({
        ...(contributionLimitConfig.defaultFields as Record<string, number>),
        review_free_daily_limit: -2,
      }),
    ).toThrow('Field review_free_daily_limit must be an integer greater than or equal to -1')
  })

  it('rejects non-positive contribution limit windows', () => {
    const entry = getDynamicConfigRegistryEntry('contribution-rate-limits')

    expect(() =>
      entry?.validate?.({
        ...(contributionLimitConfig.defaultFields as Record<string, number>),
        review_free_short_window_seconds: 0,
      }),
    ).toThrow(
      'Field review_free_short_window_seconds must be an integer greater than or equal to 1',
    )
  })

  it('rejects unordered RSS feed discoverability thresholds', () => {
    const entry = getDynamicConfigRegistryEntry('rss-feed-discoverability-config')

    expect(() =>
      entry?.validate?.({
        make_undiscoverable_max_net_score: 5,
        make_discoverable_alt_min_net_score: 4,
        make_discoverable_min_net_score: 3,
        make_discoverable_min_subscriptions: 10,
      }),
    ).toThrow('RSS feed discoverability thresholds must satisfy')
  })

  it('rejects negative RSS feed discoverability subscription thresholds', () => {
    const entry = getDynamicConfigRegistryEntry('rss-feed-discoverability-config')

    expect(() =>
      entry?.validate?.({
        make_undiscoverable_max_net_score: -5,
        make_discoverable_alt_min_net_score: 0,
        make_discoverable_min_net_score: 5,
        make_discoverable_min_subscriptions: -1,
      }),
    ).toThrow('Field make_discoverable_min_subscriptions must be a nonnegative integer')
  })

  it('rejects moderation confidence thresholds outside 0–1', () => {
    const entry = getDynamicConfigRegistryEntry('moderation-config')

    expect(() => entry?.validate?.({ ai_generated_confidence_threshold: 1.5 })).toThrow(
      'Field ai_generated_confidence_threshold must be a number between 0 and 1',
    )
  })

  it('rejects non-positive integers for Bedrock batch config fields', () => {
    const entry = getDynamicConfigRegistryEntry('bedrock-embeddings-batch-config')

    expect(() => entry?.validate?.({ max_inflight_jobs: 0 })).toThrow(
      'Field max_inflight_jobs must be a positive integer',
    )
    expect(() => entry?.validate?.({ stale_ttl_hours: -5 })).toThrow(
      'Field stale_ttl_hours must be a positive integer',
    )
    expect(() => entry?.validate?.({ stale_ttl_hours: 169 })).toThrow(
      'Field stale_ttl_hours must be less than or equal to 168',
    )
  })

  it('rejects unordered RSS feed crawl SLAs', () => {
    expect(() => validateRssFeedCrawl({ tier1_sla_ms: 5, tier2_sla_ms: 4 })).toThrow(
      'RSS feed crawl SLAs must be ordered',
    )
  })

  it('rejects non-positive safe integers for RSS feed crawl fields', () => {
    expect(() => validateRssFeedCrawl({ capacity_budget: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      'Field capacity_budget must be a safe integer between 1 and 10000',
    )
  })

  it('rejects RSS feed crawl fields above their maximums', () => {
    expect(() =>
      validateRssFeedCrawl({ tier5_sla_ms: RSS_FEED_CRAWL_MAX_VALUES.tier5_sla_ms + 1 }),
    ).toThrow('Field tier5_sla_ms must be a safe integer between 1 and 604800000')
    expect(() =>
      validateRssFeedCrawl({ capacity_budget: RSS_FEED_CRAWL_MAX_VALUES.capacity_budget + 1 }),
    ).toThrow('Field capacity_budget must be a safe integer between 1 and 10000')
  })

  it('rejects non-number RSS feed crawl numeric fields', () => {
    expect(() => validateRssFeedCrawl({ tier1_sla_ms: null as unknown as number })).toThrow(
      'Field tier1_sla_ms must be a safe integer between 1 and 604800000',
    )
    expect(() => validateRssFeedCrawl({ tier5_sla_ms: '5' as unknown as number })).toThrow(
      'Field tier5_sla_ms must be a safe integer between 1 and 604800000',
    )
  })

  it('rejects out-of-range user import/export limits', () => {
    const entry = getDynamicConfigRegistryEntry('user-import-export-config')

    expect(() => entry?.validate?.({ sync_export_max_items: 0 })).toThrow(
      'Field sync_export_max_items must be an integer between 1 and 50000',
    )
    expect(() => entry?.validate?.({ sync_export_max_items: 50_001 })).toThrow(
      'Field sync_export_max_items must be an integer between 1 and 50000',
    )
  })

  it('rejects non-number user import/export limits', () => {
    const entry = getDynamicConfigRegistryEntry('user-import-export-config')

    expect(() => entry?.validate?.({ sync_export_max_items: true })).toThrow(
      'Field sync_export_max_items must be an integer between 1 and 50000',
    )
  })
})

function validateRssFeedCrawl(overrides: Partial<typeof VALID_RSS_FEED_CRAWL_FIELDS>): void {
  const entry = getDynamicConfigRegistryEntry('rss-feed-crawl-config')
  entry?.validate?.({ ...VALID_RSS_FEED_CRAWL_FIELDS, ...overrides })
}
