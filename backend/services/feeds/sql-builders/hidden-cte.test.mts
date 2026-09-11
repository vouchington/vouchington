import { it, expect, describe } from 'vitest'
import { buildHiddenCTE } from './hidden-cte.mts'

describe('hidden-cte', () => {
  it('buildHiddenCTE produces correct SQL with idColumn', () => {
    const stmt = buildHiddenCTE('user-uuid-here', {
      relationTable: 'relation__user__hide__rss_feed_item',
      idColumn: 'rss_feed_item_id',
      cteAlias: 'hidden_items',
    })
    const sql = stmt.text + stmt.values.join(', ')
    expect(sql).toContain('hidden_items AS (')
    expect(sql).toContain('object_id AS rss_feed_item_id')
    expect(sql).toContain('relation__user__hide__rss_feed_item')
    expect(sql).toContain('subject_id')
  })

  it('buildHiddenCTE produces correct SQL for posts', () => {
    const stmt = buildHiddenCTE('user-uuid', {
      relationTable: 'relation__user__hide__post',
      idColumn: 'post_id',
      cteAlias: 'hidden_posts',
    })
    const sql = stmt.text + stmt.values.join(', ')
    expect(sql).toContain('hidden_posts AS (')
    expect(sql).toContain('object_id AS post_id')
    expect(sql).toContain('relation__user__hide__post')
  })
})
