import { describe, expect, it } from 'vitest'
import { lockExistsClause, singleLockJobType } from './lock-targets.mts'

describe('bedrock batch lock targets', () => {
  it('maps single embedding entity types to batch job types', () => {
    expect(singleLockJobType('post')).toBe('posts')
    expect(singleLockJobType('topic')).toBe('topics')
    expect(singleLockJobType('rss_feed_item')).toBe('rss_feed_items')
  })

  it('builds typed lock predicates for each batch target', () => {
    expect(lockExistsClause('topics', 'topics.id')).toContain('e.topic_id = topics.id')
    expect(lockExistsClause('posts', 'posts.id')).toContain('e.post_id = posts.id')
    expect(lockExistsClause('rss_feed_items', 'rss_feed_items.id')).toContain(
      'e.rss_feed_item_id = rss_feed_items.id',
    )
    expect(lockExistsClause('crawl_chunks', '(cc.crawl_id, cc.order_index)')).toContain(
      '(e.crawl_id, e.crawl_order_index) = (cc.crawl_id, cc.order_index)',
    )
    expect(lockExistsClause('images', 'images.id')).toContain('e.image_id = images.id')
  })
})
