import { describe, expect, it } from 'vitest'
import {
  VALID_COMMUNITY_NEWS_FEED_TYPES,
  VALID_FEED_TIME_RANGES,
  VALID_FILTERABLE_POST_TYPES,
  VALID_POST_FEED_TYPES,
  VALID_RSS_FEED_ITEM_FEED_TYPES,
  VALID_RSS_POST_TYPES,
  VALID_TRENDING_POST_TYPES,
  VALID_TRENDING_TIME_RANGES,
  isCatalogValue,
} from './index.mts'

describe('feed capability catalogs', () => {
  it('defines surface-specific feed type sets', () => {
    expect(VALID_POST_FEED_TYPES).toEqual(['follow_users', 'follow_topics', 'any', 'all'])
    expect(VALID_RSS_FEED_ITEM_FEED_TYPES).toEqual([
      'follow_users',
      'follow_rss_feeds',
      'follow_topics',
      'any',
      'all',
    ])
    expect(VALID_COMMUNITY_NEWS_FEED_TYPES).toEqual(['any', 'follow_rss_feeds', 'follow_topics'])
  })

  it('preserves intentionally different post type surfaces', () => {
    expect(VALID_FILTERABLE_POST_TYPES).toEqual([
      'discussion',
      'review',
      'data_point',
      'comment',
      'link',
      'article',
      'blog_post',
      'story',
    ])
    expect(VALID_RSS_POST_TYPES).toEqual(['discussion', 'review', 'data_point'])
    expect(VALID_TRENDING_POST_TYPES).toEqual(['discussion', 'review', 'data_point', 'story'])
  })

  it('keeps RSS post support narrower than trending and filterable post support', () => {
    expect(VALID_RSS_POST_TYPES).not.toContain('story')
    expect(VALID_TRENDING_POST_TYPES).toContain('story')
    expect(VALID_FILTERABLE_POST_TYPES).toEqual(expect.arrayContaining([...VALID_RSS_POST_TYPES]))
  })

  it('defines distinct feed and trending time ranges', () => {
    expect(VALID_FEED_TIME_RANGES).toEqual(['1d', '1w', '1m', '1y', 'all'])
    expect(VALID_TRENDING_TIME_RANGES).toEqual(['day', 'week', 'month'])
  })

  it('checks unknown values against a catalog', () => {
    expect(isCatalogValue(VALID_RSS_POST_TYPES, 'review')).toBe(true)
    expect(isCatalogValue(VALID_RSS_POST_TYPES, 'story')).toBe(false)
    expect(isCatalogValue(VALID_RSS_POST_TYPES, ['review'])).toBe(false)
  })
})
