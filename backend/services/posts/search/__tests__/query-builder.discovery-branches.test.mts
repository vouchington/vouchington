import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { getPostIds } from '../get-ids.mts'
import { buildPostSearchQuery } from '../query-builder.mts'
import { appendPostSearchOrderAndLimit } from '../query-builder/order-and-limit.mts'

const COMMUNITY_ID = '019e0000-1400-7000-8000-000000000064'
const USER = { id: '019e0000-0100-7000-8000-000000000001' } as unknown as PrivateUser

describe('discovery search branches', () => {
  it('rejects malformed community, topic, and trending bounds before querying', async () => {
    await expect(getPostIds(undefined, { community_id: 'not-a-uuid' })).rejects.toThrow(
      'community_id must be a valid UUID',
    )
    await expect(getPostIds(undefined, { trending_topic_id: 'not-a-uuid' })).rejects.toThrow(
      'trending_topic_id must be a valid UUID',
    )
    await expect(getPostIds(undefined, { trending_min_score: -1 })).rejects.toThrow(
      'trending_min_score must be nonnegative and finite',
    )
  })

  it('selects community page columns for best, trending, and hydrated data points', () => {
    const best = buildPostSearchQuery(undefined, { community_id: COMMUNITY_ID, sort: 'best' })
    expect(best.sql).toContain('candidate_posts.vote_score')
    expect(best.sql).toContain('candidate_posts AS NOT MATERIALIZED')

    const trending = buildPostSearchQuery(undefined, {
      community_id: COMMUNITY_ID,
      sort: 'trending',
      trending_topic_id: COMMUNITY_ID,
      trending_min_score: 1,
    })
    expect(trending.sql).toContain('candidate_posts.hot_score')
    expect(trending.sql).toContain('candidate_posts.trending_score')
    expect(trending.sql).toContain('relation__post__category__topic trending_topic')
    expect(trending.values).toContain(1)

    const hydrated = buildPostSearchQuery(undefined, {
      community_id: COMMUNITY_ID,
      sort: 'new',
      hydrateDataPointPage: true,
    })
    expect(hydrated.sql).toContain('candidate_posts.title')
    expect(hydrated.sql).toContain('candidate_posts.data_point_vertical')
    expect(hydrated.sql).toContain('candidate_posts.structured_data')
  })

  it('keeps pending and rejected recommendation filters on the keyed lookup', () => {
    const pending = buildPostSearchQuery(undefined, {
      post_types: ['topic_recommendation'],
      topic_recommendation_status: 'pending',
    })
    expect(pending.sql).toContain('ptr.reviewed_at IS NULL')

    const rejected = buildPostSearchQuery(undefined, {
      post_types: ['topic_recommendation'],
      topic_recommendation_status: 'rejected',
    })
    expect(rejected.sql).toContain('ptr.reviewed_at IS NOT NULL AND ptr.created_topic_id IS NULL')
  })

  it('orders following_new by the rank alias and rejects a cursor with one bound', () => {
    const missingRank = sql``
    expect(() =>
      appendPostSearchOrderAndLimit(missingRank, {
        followingRankExpression: null,
        hasSemanticSearch: false,
        hasTextSearch: false,
        limit: 25,
        omitLimit: true,
        omitOrderBy: false,
        sort: 'following_new',
      }),
    ).toThrow('following_new sort requires a rank expression')

    const followed = buildPostSearchQuery(USER, {
      community_id: COMMUNITY_ID,
      sort: 'following_new',
      following_phase: 'followed',
    })
    expect(followed.sql).toContain('ORDER BY following_rank DESC')

    expect(() => buildPostSearchQuery(USER, { sort: 'following_new', ranking_lt: 1 })).toThrow(
      'following_new cursor requires ranking_lt and id_lt',
    )
  })
})
