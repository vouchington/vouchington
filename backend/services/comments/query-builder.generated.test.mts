import { expect, it, describe } from 'vitest'
import buildCommentTreeQuery from './query-builder.mts'
import type { CommentTreeOptions } from './types.mts'

const rootId = '123e4567-e89b-12d3-a456-426614174000'

describe('query-builder.generated', () => {
  it('buildCommentTreeQuery uses posts.votes_score_sort directly for best sort root selection', () => {
    const rootId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildCommentTreeQuery(rootId, { sort: 'best' })

    expect(query.sql).not.toContain('post_elections')
    expect(query.sql).not.toContain('election_id')
    expect(query.sql).toContain('votes_score_sort')
  })

  it('buildCommentTreeQuery best sort retains vote score ordering and pagination', () => {
    const rootId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildCommentTreeQuery(rootId, {
      sort: 'best',
      vote_score_lt: 0.42,
      id_lt: '123e4567-e89b-12d3-a456-426614174001',
    })

    expect(query.sql).toContain('(posts.votes_score_sort, posts.id) < (?, ?)')
    expect(query.sql).toContain('comment_tree.votes_score_sort DESC, comment_tree.id DESC')
  })

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

  it('rejects an unexpected runtime comment sort', () => {
    expect(() =>
      buildCommentTreeQuery(rootId, { sort: 'unexpected' } as unknown as CommentTreeOptions),
    ).toThrow('Unknown comment sort')
  })
})
