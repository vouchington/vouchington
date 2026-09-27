import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers'
import { appendPostFeedDeliveryCTEs } from './delivery-ctes.mts'

const eligibilityOptions = {
  currentUser: { __entity_type: 'user' as const, id: 'user-1', roles: [] },
  postTypes: undefined,
  sort: 'new',
  textSearchQuery: undefined,
  universalTopicIds: [],
  hashtagTopicIds: undefined,
  hashtagAliasIds: undefined,
  hasUnknownHashtag: undefined,
}

describe('appendPostFeedDeliveryCTEs', () => {
  it('omits the share CTEs and union arm when share delivery is disabled', () => {
    const query = createTestSqlStatement()
    appendPostFeedDeliveryCTEs(query, {
      eligibilityOptions,
      currentUserId: 'user-1',
      cursor: {},
      feedType: 'all',
      includeSharedPosts: false,
      minScoreFollowTopics: 0,
      minScoreFollowUsers: -5,
      sort: 'new',
      timeRange: '1w',
    })
    expect(query.text).not.toContain('post_feed_shares')
    expect(query.text).not.toContain('shared_posts')
    expect(query.text).not.toContain('UNION ALL')
  })
  it('deduplicates target IDs before an indexed eligibility lookup', () => {
    const query = createTestSqlStatement()
    appendPostFeedDeliveryCTEs(query, {
      eligibilityOptions,
      currentUserId: 'user-1',
      cursor: {},
      feedType: 'follow_users',
      includeSharedPosts: true,
      minScoreFollowTopics: 0,
      minScoreFollowUsers: -5,
      sort: 'new',
      timeRange: '1w',
    })
    expect(query.text).toContain('SELECT DISTINCT post_id FROM shared_post_candidates')
    expect(query.text).toContain('eligible_shared_posts AS MATERIALIZED')
    expect(query.text).toContain('posts.id = shared_post_targets.post_id')
    expect(query.text.indexOf('shared_post_targets AS MATERIALIZED')).toBeLessThan(
      query.text.indexOf('eligible_shared_posts AS MATERIALIZED'),
    )
  })
  it('keeps hot pagination out of timestamp candidate filtering', () => {
    const query = createTestSqlStatement()
    appendPostFeedDeliveryCTEs(query, {
      eligibilityOptions: { ...eligibilityOptions, sort: 'hot' },
      currentUserId: 'user-1',
      cursor: { hot_score_lt: 1, id_lt: 'share-id' },
      feedType: 'follow_users',
      includeSharedPosts: true,
      minScoreFollowTopics: 0,
      minScoreFollowUsers: -5,
      sort: 'hot',
      timeRange: '1w',
    })
    expect(query.text).not.toContain('to_timestamp(')
    expect(query.text).toContain('eligible_shared_posts.hot_score')
  })
  it('uses the stored post share sort key for shared post ordering', () => {
    const query = createTestSqlStatement()

    appendPostFeedDeliveryCTEs(query, {
      eligibilityOptions,
      currentUserId: 'user-1',
      cursor: {},
      feedType: 'follow_users',
      includeSharedPosts: true,
      minScoreFollowTopics: 0,
      minScoreFollowUsers: -5,
      sort: 'new',
      timeRange: '1w',
    })

    expect(query.text).toContain('shared_post_candidates AS MATERIALIZED')
    expect(query.text).toContain('FROM shared_post_candidates')
    expect(query.text).toContain('post_feed_shares.sort_at')
    expect(query.text).toContain('AND post_feed_shares.sort_at >= $')
    expect(query.text).not.toContain(
      'GREATEST(post_feed_shares.created_at, eligible_posts.created_at)',
    )
    expect(query.text).not.toContain('post_topic_alias_sources')
    expect(query.text).toContain('FROM relation__post__category__topic_alias relation')
    expect(query.text).toContain('followed_topics.topic_id = alias.topic_id')
  })

  it('pushes timestamp pagination into materialized shared candidates', () => {
    const query = createTestSqlStatement()

    appendPostFeedDeliveryCTEs(query, {
      eligibilityOptions,
      currentUserId: 'user-1',
      cursor: { created_at_lt: 1_700_000_000_000, id_lt: 'share-id' },
      feedType: 'follow_users',
      includeSharedPosts: true,
      minScoreFollowTopics: 0,
      minScoreFollowUsers: -5,
      sort: 'new',
      timeRange: '1w',
    })

    const cursorFilterIndex = query.text.indexOf('post_feed_shares.sort_at < to_timestamp(')
    const sharedPostsIndex = query.text.indexOf('shared_posts AS (')
    expect(cursorFilterIndex).toBeGreaterThan(0)
    expect(cursorFilterIndex).toBeLessThan(sharedPostsIndex)
    expect(query.text).toContain('post_feed_shares.id < $')
  })
})
