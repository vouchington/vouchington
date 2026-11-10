import { describe, expect, it } from 'vitest'
import { parsePostgresSql } from 'no-mistakes'
import { buildPostFeedPageQuery } from '../services/feeds/posts/get-ids/page-query.mts'
import { buildPostSearchQuery } from '../services/posts/search/query-builder.mts'
import type { PostSearchSort } from '../services/posts/search/types.mts'

describe('post search SQL composition', () => {
  const sorts: PostSearchSort[] = ['new', 'best', 'hot', 'relevance', 'following_new']
  for (const sort of sorts) {
    for (const mode of ['plain', 'semantic', 'hybrid']) {
      it(`parses the ${mode} ${sort} query with selected expressions and joins`, async () => {
        const query = buildPostSearchQuery(undefined, {
          sort,
          limit: 26,
          ...(mode !== 'plain' && {
            semantic_search_query: 'fixture',
            semanticSearchEmbedding: [1, ...Array<number>(1023).fill(0)],
          }),
          ...(mode === 'hybrid' && { text_search_query: 'fixture' }),
        })
        const facts = await parsePostgresSql({ sql: query.text })
        expect(facts.diagnostics).toEqual([])
      })
    }
  }

  it('parses a followed-author page as two id walks', async () => {
    const query = buildPostSearchQuery({ id: '123e4567-e89b-12d3-a456-426614174000' } as never, {
      sort: 'following_new',
      limit: 26,
      ranking_lt: 1,
      id_lt: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(query.sql).toContain('WITH followed_page AS')
    expect(query.sql).toContain('LIMIT 1')
    expect(query.sql).not.toContain('MATERIALIZED')
    expect(query.sql).not.toContain('viewer_following.object_id IS NULL')
    const facts = await parsePostgresSql({ sql: query.text })
    expect(facts.diagnostics).toEqual([])
  })

  it('parses a community followed-author page with the candidate walk inline', async () => {
    const query = buildPostSearchQuery({ id: '123e4567-e89b-12d3-a456-426614174000' } as never, {
      sort: 'following_new',
      limit: 26,
      community_id: '123e4567-e89b-12d3-a456-426614174002',
      ranking_lt: 1,
      id_lt: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(query.sql).toContain('candidate_posts AS NOT MATERIALIZED')
    expect(query.sql).toContain('(SELECT count(*) FROM followed_page)')
    expect(query.sql).not.toContain(' AS MATERIALIZED')
    const facts = await parsePostgresSql({ sql: query.text })
    expect(facts.diagnostics).toEqual([])
  })

  it('parses mixed post types as two sort-key walks', async () => {
    const query = buildPostSearchQuery(undefined, {
      sort: 'new',
      limit: 26,
      post_types: ['discussion', 'topic_recommendation'],
    })
    expect(query.sql).toContain('UNION ALL')
    expect(query.sql).toContain("posts.post_type = 'topic_recommendation'::post_types")
    expect(query.sql).toContain("posts.post_type = 'discussion'::post_types")
    const facts = await parsePostgresSql({ sql: query.text })
    expect(facts.diagnostics).toEqual([])
  })

  it('parses a newest universal-topic page as bounded attachment walks', async () => {
    const query = buildPostSearchQuery(undefined, {
      sort: 'new',
      limit: 26,
      universal_topic_ids: [
        '123e4567-e89b-12d3-a456-426614174010',
        '123e4567-e89b-12d3-a456-426614174011',
      ],
      id_lt: '123e4567-e89b-12d3-a456-426614174012',
    })
    expect(query.sql).toContain('CROSS JOIN LATERAL')
    expect(query.sql).toContain('topic_aliases alias')
    expect(query.sql).toContain('LIMIT ?')
    const facts = await parsePostgresSql({ sql: query.text })
    expect(facts.diagnostics).toEqual([])
  })

  it('parses an empty community cursor as a community id row comparison', async () => {
    const query = buildPostSearchQuery(undefined, {
      sort: 'new',
      limit: 26,
      community_id: '123e4567-e89b-12d3-a456-426614174010',
      id_lt: '00000000-0000-0000-0000-000000000000',
    })
    expect(query.sql).toContain('(posts.community_id, posts.id) < (?, ?)')
    const facts = await parsePostgresSql({ sql: query.text })
    expect(facts.diagnostics).toEqual([])
  })

  it('parses the Hacker News hot rank bound', async () => {
    const query = buildPostSearchQuery(undefined, {
      has_hacker_news_references: true,
      sort: 'hot',
      time_range: '1w',
      limit: 26,
    })
    expect(query.sql).toContain(
      "1e300::DOUBLE PRECISION, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid",
    )
    expect(query.sql).toContain('hackerNewsHotWindow')
    expect(query.sql).not.toContain('posts.id >=')
    const facts = await parsePostgresSql({ sql: query.text })
    expect(facts.diagnostics).toEqual([])
  })

  it('parses a newest multi-topic feed from the first topic walk', async () => {
    const query = buildPostFeedPageQuery({
      currentUserId: '123e4567-e89b-12d3-a456-426614174000',
      cursor: null,
      cutoff: new Date('2026-11-01T00:00:00.000Z'),
      eligibilityOptions: {
        currentUser: {
          __entity_type: 'user',
          id: '123e4567-e89b-12d3-a456-426614174000',
          roles: [],
        },
        postTypes: undefined,
        sort: 'new',
        textSearchQuery: undefined,
        universalTopicIds: [
          '123e4567-e89b-12d3-a456-426614174010',
          '123e4567-e89b-12d3-a456-426614174011',
        ],
        hashtagTopicIds: undefined,
        hashtagAliasIds: undefined,
        hasUnknownHashtag: false,
      },
      feedType: 'any',
      includeSharedPosts: true,
      minScoreFollowTopics: 0,
      minScoreFollowUsers: -5,
      safeLimit: 25,
    })
    expect(query.sql).toContain('eligible_posts AS NOT MATERIALIZED')
    expect(query.sql).toContain('CROSS JOIN LATERAL')
    expect(query.sql).toContain('topic_aliases alias')
    const facts = await parsePostgresSql({ sql: query.text })
    expect(facts.diagnostics).toEqual([])
  })
})
