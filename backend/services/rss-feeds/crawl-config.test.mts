import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getCrawlCapacityBudget,
  getTierSlaMs,
  isCrawlPrioritizationEnabled,
  isRobotsTxtIgnoredForFeeds,
  RSS_FEED_CRAWL_MAX_VALUES,
  rssFeedCrawlConfig,
} from './crawl-config.mts'

describe('crawl-config', () => {
  beforeAll(async () => {
    await rssFeedCrawlConfig.waitForInitialization()
  })

  afterAll(async () => {
    await rssFeedCrawlConfig.close()
  })

  describe('isCrawlPrioritizationEnabled', () => {
    it('returns true by default', () => {
      expect(isCrawlPrioritizationEnabled()).toBe(true)
    })

    it('returns false after setField to false', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { enabled: false })
      expect(isCrawlPrioritizationEnabled()).toBe(false)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { enabled: true })
    })
  })

  describe('getTierSlaMs', () => {
    it('returns 5 min for tier 1', () => {
      expect(getTierSlaMs(1)).toBe(5 * 60_000)
    })

    it('returns 15 min for tier 2', () => {
      expect(getTierSlaMs(2)).toBe(15 * 60_000)
    })

    it('returns 1 hour for tier 3', () => {
      expect(getTierSlaMs(3)).toBe(60 * 60_000)
    })

    it('returns 2 hours for tier 4', () => {
      expect(getTierSlaMs(4)).toBe(2 * 60 * 60_000)
    })

    it('returns 24 hours for tier 5', () => {
      expect(getTierSlaMs(5)).toBe(24 * 60 * 60_000)
    })

    it('overrides SLA when a valid value is set', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { tier1_sla_ms: 10 * 60_000 })
      expect(getTierSlaMs(1)).toBe(10 * 60_000)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { tier1_sla_ms: 5 * 60_000 })
    })

    it('falls back to default when SLA is set to an invalid value', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { tier1_sla_ms: -1 })
      expect(getTierSlaMs(1)).toBe(5 * 60_000)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { tier1_sla_ms: 5 * 60_000 })
    })

    it('falls back to default when SLA exceeds the maximum', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        tier5_sla_ms: RSS_FEED_CRAWL_MAX_VALUES.tier5_sla_ms + 1,
      })
      expect(getTierSlaMs(5)).toBe(24 * 60 * 60_000)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { tier5_sla_ms: 24 * 60 * 60_000 })
    })
  })

  describe('isRobotsTxtIgnoredForFeeds', () => {
    it('returns true by default (robots.txt bypass is on globally)', () => {
      expect(isRobotsTxtIgnoredForFeeds()).toBe(true)
    })

    it('returns false when ignore_robots_txt is set to false via config', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { ignore_robots_txt: false })
      try {
        expect(isRobotsTxtIgnoredForFeeds()).toBe(false)
      } finally {
        overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { ignore_robots_txt: true })
      }
    })

    it('returns true when ignore_robots_txt is explicitly set to true via config', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { ignore_robots_txt: true })
      expect(isRobotsTxtIgnoredForFeeds()).toBe(true)
    })
  })

  describe('getCrawlCapacityBudget', () => {
    it('returns 100 by default', () => {
      expect(getCrawlCapacityBudget()).toBe(100)
    })

    it('returns overridden value when valid', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 200 })
      expect(getCrawlCapacityBudget()).toBe(200)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 100 })
    })

    it('falls back to default when value is 0', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 0 })
      expect(getCrawlCapacityBudget()).toBe(100)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 100 })
    })

    it('falls back to default when value exceeds the maximum', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: RSS_FEED_CRAWL_MAX_VALUES.capacity_budget + 1,
      })
      expect(getCrawlCapacityBudget()).toBe(100)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 100 })
    })
  })
})
