import { describe, expect, it } from 'vitest'
import { createEligibleRssFeedItemsCteBaseQueryForTest } from '@voucha/test-helpers'
import type { RssFeedItemFeedOptions } from '../../types.mts'
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

function communityScopedText(feedType: RssFeedItemFeedOptions['feed_type']): string {
  const query = createEligibleRssFeedItemsCteBaseQueryForTest()
  appendEligibleRssFeedItemsCTE(query, {
    communityId: 'community-1',
    currentUserIsAdministrator: false,
    feedType,
    hasRelatedPosts: undefined,
    mediaTypes: [],
    textSearchQuery: undefined,
    topicIds: undefined,
    hashtagTopicIds: undefined,
    hashtagAliasIds: undefined,
    hasUnknownHashtag: undefined,
  })
  return query.text
}

const SOURCE_SCOPE = 'rss_feed_item_sources scope_rfis'

describe('appendEligibleRssFeedItemsCTE community scope', () => {
  it('rejects an unexpected runtime feed type for a community scope', () => {
    expect(() => communityScopedText('unexpected' as RssFeedItemFeedOptions['feed_type'])).toThrow(
      'Unknown RSS feed item feed type',
    )
  })

  it('scopes follow_rss_feeds feeds to followed sources only', () => {
    expect(communityScopedText('follow_rss_feeds')).toContain(SOURCE_SCOPE)
  })

  it('scopes follow_topics feeds without the source scope', () => {
    expect(communityScopedText('follow_topics')).not.toContain(SOURCE_SCOPE)
  })

  it('requires both scopes for all feeds', () => {
    const all = communityScopedText('all')

    expect(all).toContain(SOURCE_SCOPE)
    expect(all.length).toBeGreaterThan(communityScopedText('follow_topics').length)
  })

  it('accepts either scope for any feeds', () => {
    const any = communityScopedText('any')

    expect(any).toContain(SOURCE_SCOPE)
    expect(any).toContain('OR')
  })

  it('adds no community scope for follow_users or an unset feed type', () => {
    expect(communityScopedText('follow_users')).not.toContain(SOURCE_SCOPE)
    expect(communityScopedText(undefined)).not.toContain(SOURCE_SCOPE)
  })
})
