import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { postsWorkConfig } from '../../work-limits.mts'
import { buildPostSearchQuery } from '../query-builder.mts'

describe('Hacker News hot query bounds', () => {
  it('keeps the Hacker News flag inside the hot-score walk', async () => {
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
      expect(query.sql).toContain('posts.has_hacker_news_references')
      expect(query.sql).toContain('hackerNewsHotWindow')
      expect(query.sql).toContain('uuid_extract_timestamp(posts.id)')
      expect(query.sql).not.toContain('posts.id >=')
      expect(query.sql).toContain(
        "1e300::DOUBLE PRECISION, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid",
      )
      expect(query.sql).toContain('posts.search_vector')
      expect(query.sql).toContain(
        'ORDER BY (CASE WHEN posts.votes_score_sort > 0 THEN LN(posts.votes_score_sort::DOUBLE PRECISION)',
      )
      expect(query.sql).not.toContain('ORDER BY hot_score')
      expect(query.sql).not.toContain('hacker_news_hot_candidates')
      expect(query.sql).not.toMatch(/ORDER BY posts\.id DESC\s+LIMIT/)
      expect(query.values).not.toContain(2)
    } finally {
      restoreVisibility()
      restoreCap()
    }
  })

  it('does not turn the candidate-limit config into a newest-id window', async () => {
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
      expect(query.sql).toContain('posts.has_hacker_news_references')
      expect(query.sql).toContain('uuid_extract_timestamp(posts.id)')
      expect(query.sql).not.toContain('posts.id >=')
      expect(query.sql).toContain(
        "1e300::DOUBLE PRECISION, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid",
      )
      expect(query.sql).toContain(
        'ORDER BY (CASE WHEN posts.votes_score_sort > 0 THEN LN(posts.votes_score_sort::DOUBLE PRECISION)',
      )
      expect(query.sql).not.toContain('ORDER BY hot_score')
      expect(query.sql).not.toContain('LIMIT 1000')
      expect(query.sql).not.toContain('LIMIT 1000000')
      expect(query.values).not.toContain(1_000_000)
    } finally {
      restoreVisibility()
      restore()
    }
  })
})
