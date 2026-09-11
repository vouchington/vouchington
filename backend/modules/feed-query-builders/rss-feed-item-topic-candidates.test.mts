import { describe, expect, it } from 'vitest'
import {
  buildRssFeedItemTopicCandidateSelect,
  buildRssFeedItemTopicMembershipExists,
} from './rss-feed-item-topic-candidates.mts'

describe('buildRssFeedItemTopicCandidateSelect', () => {
  it('selects candidate rss_feed_item ids from the direct and alias relations, joined by exactly one UNION ALL', () => {
    const select = buildRssFeedItemTopicCandidateSelect('topic-1')

    expect(select.text).toContain('FROM relation__rss_feed_item__category__topic ')
    expect(select.text).toContain('JOIN relation__rss_feed_item__category__topic_alias')
    expect(select.text.match(/UNION ALL/g)).toHaveLength(1)
    expect(select.values).toEqual(['topic-1', 'topic-1'])
  })
})

describe('buildRssFeedItemTopicMembershipExists', () => {
  it('builds a candidate-bind IN over the direct and alias relations, not a correlated EXISTS', () => {
    const membership = buildRssFeedItemTopicMembershipExists('rss_feed_items.id', 'topic-1')

    expect(membership.text).toContain('rss_feed_items.id IN (')
    expect(membership.text).toContain('SELECT candidate.rss_feed_item_id')
    expect(membership.text).toContain('relation__rss_feed_item__category__topic')
    expect(membership.text).toContain('relation__rss_feed_item__category__topic_alias')
    expect(membership.text).not.toContain('EXISTS (')
    expect(membership.values).toContain('topic-1')
  })

  it('reuses buildRssFeedItemTopicCandidateSelect verbatim as its candidate body', () => {
    const membership = buildRssFeedItemTopicMembershipExists('rss_feed_items.id', 'topic-1')
    const candidateSelect = buildRssFeedItemTopicCandidateSelect('topic-1')

    expect(membership.text).toContain(candidateSelect.text)
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
