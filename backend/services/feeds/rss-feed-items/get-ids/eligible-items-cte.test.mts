import { describe, expect, it } from 'vitest'
import { createEligibleRssFeedItemsCteBaseQueryForTest } from '@voucha/test-helpers'
import { appendEligibleRssFeedItemsCTE } from './eligible-items-cte.mts'

describe('appendEligibleRssFeedItemsCTE', () => {
  it('adds text search and topic filters', () => {
    const query = createEligibleRssFeedItemsCteBaseQueryForTest()

    appendEligibleRssFeedItemsCTE(query, {
      communityId: undefined,
      currentUserIsAdministrator: false,
      feedType: 'any',
      hasRelatedPosts: undefined,
      mediaTypes: [],
      textSearchQuery: ' travel ',
      topicIds: ['topic-1'],
      hashtagTopicIds: undefined,
      hashtagAliasIds: undefined,
      hasUnknownHashtag: undefined,
    })

    expect(query.text).toContain("websearch_to_tsquery('voucha_english'")
    expect(query.text).toContain('rss_feed_item_sources topic_rfis')
    expect(query.text).toContain('topic_rf.topic_id = ANY')
    expect(query.text).toContain('topic_rf.is_enabled = TRUE')
    expect(query.values).toContain('travel')
    expect(query.values).toContainEqual(['topic-1'])
  })

  it('adds linked and exact hashtag filters and rejects unknown hashtags', () => {
    const query = createEligibleRssFeedItemsCteBaseQueryForTest()

    appendEligibleRssFeedItemsCTE(query, {
      communityId: undefined,
      currentUserIsAdministrator: false,
      feedType: 'any',
      hasRelatedPosts: undefined,
      mediaTypes: [],
      textSearchQuery: undefined,
      topicIds: undefined,
      hashtagTopicIds: ['topic-1'],
      hashtagAliasIds: ['alias-1'],
      hasUnknownHashtag: true,
    })

    expect(query.text).toContain('relation__rss_feed_item__category__topic_alias')
    expect(query.text).toContain('AND FALSE')
    expect(query.values).toContain('topic-1')
    expect(query.values).toContain('alias-1')
  })
})
