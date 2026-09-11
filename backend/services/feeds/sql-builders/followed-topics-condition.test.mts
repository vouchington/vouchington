import { it, expect, describe } from 'vitest'
import { buildFollowedTopicsCondition } from './followed-topics-condition.mts'

describe('followed-topics-condition', () => {
  it('related_topics with itemIdColumn uses subject_id', () => {
    const stmt = buildFollowedTopicsCondition([
      {
        type: 'related_topics',
        tableName: 'relation__rss_feed_item__category__topic',
        itemIdColumn: 'eligible_rss_feed_items.item_id',
      },
    ])
    const sql = stmt.text + stmt.values.join(', ')
    expect(sql).toContain('subject_id')
    expect(sql).toContain('relation__rss_feed_item__category__topic')
    expect(sql).toContain('eligible_rss_feed_items.item_id')
  })

  it('category_topics with foreignKeyColumn and itemIdColumn produces correct SQL', () => {
    const stmt = buildFollowedTopicsCondition([
      {
        type: 'category_topics',
        tableName: 'rss_feed_item_categories',
        foreignKeyColumn: 'rss_feed_item_id',
        itemIdColumn: 'eligible_rss_feed_items.item_id',
      },
    ])
    const sql = stmt.text + stmt.values.join(', ')
    expect(sql).toContain('rss_feed_item_categories')
    expect(sql).toContain('rss_feed_item_id')
    expect(sql).toContain('eligible_rss_feed_items.item_id')
    expect(sql).toContain('followed_topics')
  })

  it('multiple conditions are joined with OR', () => {
    const stmt = buildFollowedTopicsCondition([
      {
        type: 'related_topics',
        tableName: 'relation__rss_feed_item__category__topic',
        itemIdColumn: 'eligible_rss_feed_items.item_id',
      },
      {
        type: 'category_topics',
        tableName: 'rss_feed_item_categories',
        foreignKeyColumn: 'rss_feed_item_id',
        itemIdColumn: 'eligible_rss_feed_items.item_id',
      },
    ])
    const sql = stmt.text + stmt.values.join(', ')
    expect(sql).toContain('OR')
    expect(sql).toContain('relation__rss_feed_item__category__topic')
    expect(sql).toContain('rss_feed_item_categories')
  })
})
