import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getCrawlCapacityBudget,
  getTierSlaMs,
  isRobotsTxtIgnoredForFeeds,
  rssFeedCrawlConfig,
} from './crawl-config.mts'

describe('crawl-config', () => {
  beforeAll(async () => {
    await rssFeedCrawlConfig.waitForInitialization()
  })

  afterAll(async () => {
    await rssFeedCrawlConfig.close()
  })

  describe('getTierSlaMs', () => {
    it.each([
      [1, 300_000],
      [2, 900_000],
      [3, 3_600_000],
      [4, 7_200_000],
      [5, 86_400_000],
    ] as const)('returns the default SLA for tier %i', (tier, expectedMs) => {
      expect(getTierSlaMs(tier)).toBe(expectedMs)
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
        tier5_sla_ms: 604_800_001,
      })
      expect(getTierSlaMs(5)).toBe(86_400_000)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { tier5_sla_ms: 24 * 60 * 60_000 })
    })
  })

  describe('isRobotsTxtIgnoredForFeeds', () => {
    it('returns true by default (robots.txt bypass is on globally)', () => {
      expect(isRobotsTxtIgnoredForFeeds()).toBe(true)
    })

    it('returns false when should_ignore_robots_txt is set to false via config', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { should_ignore_robots_txt: false })
      try {
        expect(isRobotsTxtIgnoredForFeeds()).toBe(false)
      } finally {
        overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { should_ignore_robots_txt: true })
      }
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

    it('falls back to default when value exceeds the maximum', async () => {
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, {
        capacity_budget: 10_001,
      })
      expect(getCrawlCapacityBudget()).toBe(100)
      overrideDynamicConfigFieldsForTest(rssFeedCrawlConfig, { capacity_budget: 100 })
    })
  })
})
