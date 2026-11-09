import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { postsWorkConfig } from '../../work-limits.mts'
import { buildPostSearchQuery } from '../query-builder.mts'

describe('Hacker News hot query bounds', () => {
  it('caps newest time-window keys before applying Hacker News and viewer filters', async () => {
    await Promise.all([
      postsWorkConfig.waitForInitialization(),
      hackerNewsVisibilityConfig.waitForInitialization(),
    ])
    const restoreCap = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      hacker_news_hot_candidate_limit: 2,
    })
    const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: true,
    })
    try {
      const query = buildPostSearchQuery(undefined, {
        has_hacker_news_references: true,
        sort: 'hot',
        time_range: '1w',
        text_search_query: 'fixture',
      })
      const rawStart = query.sql.indexOf('bounded_post_search_candidates AS (')
      const eligibleStart = query.sql.indexOf('hacker_news_hot_candidates AS (')
      const raw = query.sql.slice(rawStart, eligibleStart)
      expect(rawStart).toBeGreaterThanOrEqual(0)
      expect(eligibleStart).toBeGreaterThan(rawStart)
      expect(raw).toContain('hackerNewsHotWindow')
      expect(raw).toContain('ORDER BY posts.id DESC LIMIT 2')
      expect(raw).not.toContain('has_hacker_news_references')
      expect(raw).not.toContain('search_vector')
      expect(raw).not.toContain('approved_at')
      expect(query.sql.slice(eligibleStart)).toContain('posts.has_hacker_news_references')
      expect(query.sql.slice(eligibleStart)).toContain('posts.search_vector')
    } finally {
      restoreVisibility()
      restoreCap()
    }
  })

  it('enforces the hard maximum in the SQL limit even if config bypasses admin validation', async () => {
    await Promise.all([
      postsWorkConfig.waitForInitialization(),
      hackerNewsVisibilityConfig.waitForInitialization(),
    ])
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      hacker_news_hot_candidate_limit: 1_000_000,
    })
    const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: true,
    })
    try {
      const query = buildPostSearchQuery(undefined, {
        has_hacker_news_references: true,
        sort: 'hot',
        time_range: '1m',
      })
      expect(query.sql).toMatch(/ORDER BY posts\.id DESC\s+LIMIT 1000\b/)
      expect(query.sql).not.toContain('LIMIT 1000000')
      const restoreMax = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        hacker_news_hot_candidate_limit: 10_000,
      })
      try {
        const atMax = buildPostSearchQuery(undefined, {
          has_hacker_news_references: true,
          sort: 'hot',
          time_range: '1m',
        })
        expect(atMax.sql).toMatch(/ORDER BY posts\.id DESC\s+LIMIT 10000\b/)
      } finally {
        restoreMax()
      }
    } finally {
      restoreVisibility()
      restore()
    }
  })
})
