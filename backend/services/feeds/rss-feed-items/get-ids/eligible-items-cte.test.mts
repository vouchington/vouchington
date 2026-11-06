import { describe, expect, it } from 'vitest'
import { createEligibleRssFeedItemsCteBaseQueryForTest } from '@voucha/test-helpers'
import { appendEligibleRssFeedItemsCTE } from './eligible-items-cte.mts'

describe('appendEligibleRssFeedItemsCTE', () => {
  it('binds text and topic filters to a point-eligible shared item', () => {
    const query = createEligibleRssFeedItemsCteBaseQueryForTest()
    appendEligibleRssFeedItemsCTE(query, {
      currentUserIsAdministrator: false,
      hasRelatedPosts: undefined,
      mediaTypes: [],
      textSearchQuery: ' travel ',
      topicIds: ['topic-1'],
      hashtagTopicIds: undefined,
      hashtagAliasIds: undefined,
      hasUnknownHashtag: undefined,
      eligibilityChildLimit: 4,
    })
    expect(query.text).toContain("websearch_to_tsquery('voucha_english'")
    expect(query.text).toContain(') topic_rfis')
    expect(query.text).toContain('topic_rf.topic_id = ANY')
    expect(query.values).toContain('travel')
    expect(query.values).toContainEqual(['topic-1'])
  })

  it('keeps exact alias and unknown-hashtag filters', () => {
    const query = createEligibleRssFeedItemsCteBaseQueryForTest()
    appendEligibleRssFeedItemsCTE(query, {
      currentUserIsAdministrator: false,
      hasRelatedPosts: undefined,
      mediaTypes: [],
      textSearchQuery: undefined,
      topicIds: undefined,
      hashtagTopicIds: ['topic-1'],
      hashtagAliasIds: ['alias-1'],
      hasUnknownHashtag: true,
      eligibilityChildLimit: 4,
    })
    expect(query.text).toContain('AND FALSE')
    expect(query.values).toContain('topic-1')
    expect(query.values).toContain('alias-1')
  })
})
