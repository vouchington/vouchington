import { createRssFeedItemHashtagFiltersBaseQueryForTest } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { appendRssFeedItemHashtagFilters } from './hashtag-filters.mts'

describe('appendRssFeedItemHashtagFilters', () => {
  it('replaces the correlated-EXISTS hashtag-topic leg with a candidate-bind IN, leaving the feed-owner leg untouched', () => {
    const query = createRssFeedItemHashtagFiltersBaseQueryForTest()
    appendRssFeedItemHashtagFilters(query, {
      aliasIds: undefined,
      hasUnknownHashtag: undefined,
      topicIds: ['topic-1'],
    })

    expect(query.text).toContain('FROM rss_feed_item_sources hashtag_sources')
    expect(query.text).toContain('rss_feed_items.id IN (')
    expect(query.text).toContain('SELECT candidate.rss_feed_item_id')
    expect(query.text).not.toMatch(/EXISTS\s*\([^)]*UNION ALL/s)
    expect(query.values).toContain('topic-1')
  })

  it('dedupes repeated topic ids into exactly one AND (...) clause', () => {
    const query = createRssFeedItemHashtagFiltersBaseQueryForTest()
    appendRssFeedItemHashtagFilters(query, {
      aliasIds: undefined,
      hasUnknownHashtag: undefined,
      topicIds: ['topic-1', 'topic-1'],
    })

    expect(query.text.match(/AND \(\s*\n\s*EXISTS \(/g)).toHaveLength(1)
  })

  it('leaves the alias-only loop as a plain EXISTS, not the candidate-bind shape', () => {
    const query = createRssFeedItemHashtagFiltersBaseQueryForTest()
    appendRssFeedItemHashtagFilters(query, {
      aliasIds: ['alias-1'],
      hasUnknownHashtag: undefined,
      topicIds: undefined,
    })

    expect(query.text).toContain('EXISTS (')
    expect(query.text).toContain('relation__rss_feed_item__category__topic_alias')
    expect(query.text).not.toContain('rss_feed_items.id IN (')
    expect(query.values).toContain('alias-1')
  })

  it('appends AND FALSE when hasUnknownHashtag is set', () => {
    const query = createRssFeedItemHashtagFiltersBaseQueryForTest()
    appendRssFeedItemHashtagFilters(query, {
      aliasIds: undefined,
      hasUnknownHashtag: true,
      topicIds: undefined,
    })

    expect(query.text).toContain('AND FALSE')
  })
})
