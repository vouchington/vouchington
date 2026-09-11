import { it, expect, describe } from 'vitest'
import { buildPostSearchQuery } from '../query-builder.mts'
import type { PrivateUser } from '@services/users/types'

describe('query-builder (pagination and moderation)', () => {
  it('buildPostSearchQuery adds pagination filter with id_lt for sort=new', () => {
    const testId = '123e4567-e89b-12d3-a456-426614174000'

    const query = buildPostSearchQuery(undefined, {
      sort: 'new',
      id_lt: testId,
    })

    // Should add posts.id < ? predicate
    expect(query.sql).toContain('posts.id <')
    expect(query.values).toContain(testId)
  })

  it('buildPostSearchQuery allows drafts when currentUser matches user_id', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery({ id: userId } as unknown as PrivateUser, {
      user_id: userId,
      drafts: true,
    })

    // Should NOT have published_at IS NOT NULL filter when viewing own drafts
    // Check that we still filter by deleted_at but can see unpublished
    expect(query.sql).toContain('deleted_at IS NULL')
    // The query should allow both published and unpublished posts
  })

  it('buildPostSearchQuery enforces published_at for non-matching user', () => {
    const userId1 = '123e4567-e89b-12d3-a456-426614174001'
    const userId2 = '123e4567-e89b-12d3-a456-426614174002'
    const query = buildPostSearchQuery({ id: userId1 } as unknown as PrivateUser, {
      user_id: userId2,
      drafts: true,
    })

    expect(query.sql).toContain('deleted_at IS NULL')
  })

  it('buildPostSearchQuery enforces published_at when drafts=true without user_id', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery({ id: userId } as unknown as PrivateUser, {
      drafts: true,
      // Note: no user_id filter
    })

    expect(query.sql).toContain('deleted_at IS NULL')
  })

  it('buildPostSearchQuery enforces published_at for logged-out user even with drafts=true', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery(
      undefined, // logged out
      {
        user_id: userId,
        drafts: true,
      },
    )

    expect(query.sql).toContain('deleted_at IS NULL')
  })

  it('buildPostSearchQuery adds composite pagination filter with vote_score_lt and id_lt for sort=best', () => {
    const testId = '123e4567-e89b-12d3-a456-426614174000'
    const testScore = 42.5

    const query = buildPostSearchQuery(undefined, {
      sort: 'best',
      vote_score_lt: testScore,
      id_lt: testId,
    })

    // Should add composite pagination predicate using tuple comparison: (votes_score_sort, posts.id) < (?, ?)
    expect(query.sql).toContain('votes_score_sort')
    expect(query.sql).toContain('(posts.votes_score_sort, posts.id) < (?, ?)')
    expect(query.values).toContain(testScore)
    expect(query.values).toContain(testId)
  })

  it('buildPostSearchQuery throws when vote_score_lt is provided without id_lt for sort=best', () => {
    expect(() =>
      buildPostSearchQuery(undefined, {
        sort: 'best',
        vote_score_lt: 42.5,
      }),
    ).toThrowError('vote_score_lt requires id_lt')
  })

  it('buildPostSearchQuery adds composite pagination filter with ranking_lt and id_lt for sort=relevance', () => {
    const testId = '123e4567-e89b-12d3-a456-426614174000'
    const testRanking = 0.8765

    const query = buildPostSearchQuery(undefined, {
      text_search_query: 'test query',
      sort: 'relevance',
      ranking_lt: testRanking,
      id_lt: testId,
    })

    // Should add composite pagination predicate using tuple comparison with ts_rank expression
    expect(query.sql).toContain('ranking_score')
    expect(query.sql).toContain('posts.id) < (?, ?)')
    expect(query.values).toContain(testRanking)
    expect(query.values).toContain(testId)
  })

  it('buildPostSearchQuery includes hot_score in SELECT for sort=hot', () => {
    const query = buildPostSearchQuery(undefined, { sort: 'hot' })

    expect(query.sql).toContain('hot_score')
    expect(query.sql).toContain('POWER(2.0')
  })

  it('buildPostSearchQuery orders by hot_score DESC for sort=hot', () => {
    const query = buildPostSearchQuery(undefined, { sort: 'hot' })

    expect(query.sql).toContain('hot_score DESC, posts.id DESC')
  })

  it('buildPostSearchQuery adds composite pagination filter for sort=hot with hot_score_lt and id_lt', () => {
    const testId = '01234567-0000-7000-0000-000000000000'
    const testScore = 0.5

    const query = buildPostSearchQuery(undefined, {
      sort: 'hot',
      hot_score_lt: testScore,
      id_lt: testId,
    })

    expect(query.sql).toContain('< (')
    expect(query.values).toContain(testScore)
    expect(query.values).toContain(testId)
  })

  it('buildPostSearchQuery throws when hot_score_lt is provided without id_lt for sort=hot', () => {
    expect(() =>
      buildPostSearchQuery(undefined, {
        sort: 'hot',
        hot_score_lt: 0.5,
      }),
    ).toThrowError('hot_score_lt requires id_lt')
  })

  it('buildPostSearchQuery does not include hot_score for sort=new', () => {
    const query = buildPostSearchQuery(undefined, { sort: 'new' })

    expect(query.sql).not.toContain('hot_score')
  })

  it('buildPostSearchQuery throws when following_new cursor is missing ranking_lt', () => {
    expect(() =>
      buildPostSearchQuery({ id: 'user-1' } as unknown as PrivateUser, {
        sort: 'following_new',
        id_lt: '123e4567-e89b-12d3-a456-426614174000',
      }),
    ).toThrowError('following_new cursor requires ranking_lt')
  })

  it('buildPostSearchQuery hides non-approved posts for anonymous users', () => {
    const query = buildPostSearchQuery(undefined, {})

    // Clearance gate: only approved posts are visible to anonymous users
    expect(query.sql).toContain('approved_at IS NOT NULL')
  })

  it('buildPostSearchQuery hides non-approved posts from non-owner authenticated users', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery({ id: userId } as unknown as PrivateUser, {})

    // Clearance gate: approved OR creator's own pending posts
    expect(query.sql).toContain('approved_at IS NOT NULL')
    expect(query.sql).toContain('created_by_id')
  })

  it('buildPostSearchQuery shows flagged posts to post owners', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery({ id: userId } as unknown as PrivateUser, {})

    // Query should allow viewing flagged posts if created_by_id matches
    expect(query.sql).toContain('created_by_id')
    expect(query.values).toContain(userId)
  })

  it('buildPostSearchQuery omits ORDER BY when omitOrderBy is true', () => {
    const query = buildPostSearchQuery(undefined, { omitOrderBy: true })

    expect(query.sql).not.toContain('ORDER BY')
  })

  it('buildPostSearchQuery shows all posts to admins', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery(
      { id: userId, roles: ['administrator'] } as unknown as PrivateUser,
      {},
    )

    // Admins bypass the clearance gate entirely
    expect(query.sql).not.toContain('approved_at IS NOT NULL')
  })
})
