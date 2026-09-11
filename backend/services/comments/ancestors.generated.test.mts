import { expect, it, describe } from 'vitest'
import { createCommentAncestorInputSqlForTest } from '@voucha/test-helpers'
import { buildCommentAncestorsQuery } from './ancestors.mts'

describe('ancestors.generated', () => {
  it('buildCommentAncestorsQuery uses posts.votes_score_sort directly', () => {
    const query = buildCommentAncestorsQuery(createCommentAncestorInputSqlForTest())

    expect(query.sql).not.toContain('post_elections')
    expect(query.sql).not.toContain('election_id')
    expect(query.sql).toContain('ancestors.votes_score_sort AS vote_score')
  })
})
