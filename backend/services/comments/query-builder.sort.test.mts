import { describe, expect, it } from 'vitest'
import buildCommentTreeQuery from './query-builder.mts'

const rootId = '123e4567-e89b-12d3-a456-426614174000'

describe('buildCommentTreeQuery sort', () => {
  it('orders by id and omits the vote score column for new sort', () => {
    const { sql } = buildCommentTreeQuery(rootId, { sort: 'new' })

    expect(sql).toContain('ORDER BY posts.id DESC')
    expect(sql).toContain('ORDER BY comment_tree.id DESC')
    expect(sql).not.toContain('AS vote_score')
  })

  it('orders by vote score and selects it for best sort', () => {
    const { sql } = buildCommentTreeQuery(rootId, { sort: 'best' })

    expect(sql).toContain('ORDER BY posts.votes_score_sort DESC, posts.id DESC')
    expect(sql).toContain('comment_tree.votes_score_sort AS vote_score')
  })
})
