import { describe, expect, it } from 'vitest'
import { createEligibleRssFeedItemsCteBaseQueryForTest } from '@voucha/test-helpers'
import { appendRssFeedItemEligibilityFilters } from './eligibility-filters.mts'

describe('appendRssFeedItemEligibilityFilters', () => {
  it('adds every common eligibility predicate', () => {
    const query = createEligibleRssFeedItemsCteBaseQueryForTest()

    appendRssFeedItemEligibilityFilters(query, {
      currentUserId: 'user-1',
      currentUserIsAdministrator: false,
      hasRelatedPosts: true,
      mediaTypes: ['article'],
      textSearchQuery: ' travel ',
      topicIds: ['source-topic-1'],
      hashtagTopicIds: ['hashtag-topic-1'],
      hashtagAliasIds: ['hashtag-alias-1'],
      hasUnknownHashtag: true,
    })

    expect(query.text).toContain('rss_feed_items.deleted_at IS NULL')
    expect(query.text).toContain('FROM rss_feed_item_sources rfis')
    expect(query.text).toContain('rf.is_enabled = TRUE')
    expect(query.text).toContain('rf.deleted_at IS NULL')
    expect(query.text).toContain('FROM excluded_rss_feeds')
    expect(query.text).toContain('publisher_type_relation')
    expect(query.text).toContain('FROM hidden_items')
    expect(query.text).toContain('FROM rss_feed_item_categories muted_category')
    expect(query.text).toContain('FROM urls u_excl')
    expect(query.text).toContain('relation__post__related__url')
    expect(query.text).toContain('rss_feed_items.media_type = ANY')
    expect(query.text).toContain("websearch_to_tsquery('voucha_english'")
    expect(query.text).toContain('rss_feed_item_sources topic_rfis')
    expect(query.text).toContain('topic_rf.is_enabled = TRUE')
    expect(query.text).toContain('topic_rf.deleted_at IS NULL')
    expect(query.text).toContain('rss_feed_item_sources hashtag_sources')
    expect(query.text).toContain('relation__rss_feed_item__category__topic_alias')
    expect(query.text).toContain('AND FALSE')
  })
})
