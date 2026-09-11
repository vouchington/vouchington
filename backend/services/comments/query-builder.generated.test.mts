import { expect, it, describe } from 'vitest'
import buildCommentTreeQuery from './query-builder.mts'

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
})
