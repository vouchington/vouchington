import { describe, expect, it } from 'vitest'
import { createEligibleRssFeedItemsCteBaseQueryForTest } from '@voucha/test-helpers'
import type { RssFeedItemFeedOptions } from '../../types.mts'
import { appendEligibleRssFeedItemsCTE } from './eligible-items-cte.mts'

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
