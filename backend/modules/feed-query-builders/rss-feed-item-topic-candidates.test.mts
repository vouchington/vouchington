import { describe, expect, it } from 'vitest'
import { buildRssFeedItemTopicMembershipExists } from './rss-feed-item-topic-candidates.mts'

describe('buildRssFeedItemTopicMembershipExists', () => {
  it('builds a candidate-bind IN over the direct and alias relations, joined by exactly one UNION ALL', () => {
    const membership = buildRssFeedItemTopicMembershipExists('rss_feed_items.id', 'topic-1')

    expect(membership.text).toContain('rss_feed_items.id IN (')
    expect(membership.text).toContain('SELECT candidate.rss_feed_item_id')
    expect(membership.text).toContain('FROM relation__rss_feed_item__category__topic ')
    expect(membership.text).toContain('JOIN relation__rss_feed_item__category__topic_alias')
    expect(membership.text.match(/UNION ALL/g)).toHaveLength(1)
    expect(membership.text).not.toContain('EXISTS (')
    expect(membership.values).toEqual(['topic-1', 'topic-1'])
  })

  it('throws for an invalid rssFeedItemIdColumn', () => {
    expect(() =>
      buildRssFeedItemTopicMembershipExists('rss_feed_items.id; DROP TABLE users', 'topic-1'),
    ).toThrow('Invalid rssFeedItemIdColumn format: rss_feed_items.id; DROP TABLE users')
  })

  it('throws for a bare column name without a table prefix', () => {
    expect(() => buildRssFeedItemTopicMembershipExists('id', 'topic-1')).toThrow(
      'Invalid rssFeedItemIdColumn format: id',
    )
  })
})
