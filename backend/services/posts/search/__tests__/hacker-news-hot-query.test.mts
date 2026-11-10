import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { postsWorkConfig } from '../../work-limits.mts'
import { buildPostSearchQuery } from '../query-builder.mts'

describe('Hacker News hot query bounds', () => {
  it('orders the stored hot rank inside the thirty-day window and the inspected cap', async () => {
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
        limit: 25,
      })
      expect(query.sql).not.toContain('hacker_news_hot_candidates')
      expect(query.sql).not.toContain('bounded_post_search_candidates')
      expect(query.sql).toContain('hackerNewsHotWindow')
      expect(query.sql).toContain('posts.has_hacker_news_references')
      expect(query.sql).toContain('posts.search_vector')
      expect(query.sql).toContain('ORDER BY hot_score DESC, posts.id DESC')
      expect(query.sql).toMatch(/LIMIT \?/)
      expect(query.values).toContain(2)
      expect(query.values).not.toContain(25)
    } finally {
      restoreVisibility()
      restoreCap()
    }
  })

  it('uses the default cap when config exceeds the maximum and accepts the hard maximum', async () => {
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
        limit: 1_000_000,
      })
      expect(query.sql).toMatch(/ORDER BY hot_score DESC, posts\.id DESC\s+LIMIT \?/)
      expect(query.values).toContain(1000)
      expect(query.values).not.toContain(10_000)
      expect(query.values).not.toContain(1_000_000)
      const restoreMax = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        hacker_news_hot_candidate_limit: 10_000,
      })
      try {
        const atMax = buildPostSearchQuery(undefined, {
          has_hacker_news_references: true,
          sort: 'hot',
          time_range: '1m',
          limit: 1_000_000,
        })
        expect(atMax.sql).toMatch(/ORDER BY hot_score DESC, posts\.id DESC\s+LIMIT \?/)
        expect(atMax.values).toContain(10_000)
      } finally {
        restoreMax()
      }
    } finally {
      restoreVisibility()
      restore()
    }
  })
})
