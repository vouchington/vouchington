import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers'
import { appendPostFeedDeliveryCTEs } from './delivery-ctes.mts'

describe('appendPostFeedDeliveryCTEs', () => {
  it('uses the stored post share sort key for shared post ordering', () => {
    const query = createTestSqlStatement()

    appendPostFeedDeliveryCTEs(query, {
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
