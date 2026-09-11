import { it, expect, describe } from 'vitest'
import { buildPostSearchQuery } from '../query-builder.mts'

describe('query-builder (basic)', () => {
  it('buildPostSearchQuery generates valid SQL for basic search', () => {
    const query = buildPostSearchQuery(undefined, { limit: 10 })

    expect(query).toBeDefined()
    expect(query.sql).toBeDefined()
    expect(query.sql).toContain('FROM posts')
    expect(query.sql).toContain('WHERE')
    expect(query.sql).toContain('deleted_at IS NULL')
    expect(query.sql).toContain('LIMIT')
  })

  it('buildPostSearchQuery defaults to sort=new when no search queries', () => {
    const query = buildPostSearchQuery(undefined, {})

    expect(query.sql).toContain('ORDER BY')
    expect(query.sql).toContain('id DESC')
  })

  it('buildPostSearchQuery defaults to sort=relevance when text search is provided', () => {
    const query = buildPostSearchQuery(undefined, {
      text_search_query: 'test query',
    })

    expect(query.sql).toContain('ranking_score')
    expect(query.sql).toContain('ts_rank')
    expect(query.sql).toContain('websearch_to_tsquery')
  })

  it('buildPostSearchQuery defaults to sort=relevance when semantic search is provided', () => {
    // Pre-computed embedding is required for semantic search
    const testEmbedding = Array(1024).fill(0.1) // Bedrock Nova embedding dimension
    const query = buildPostSearchQuery(undefined, {
      semantic_search_query: 'test query',
      semanticSearchEmbedding: testEmbedding,
    })

    expect(query.sql).toContain('ranking_score')
    expect(query.sql).toContain('bedrock_nova_multimodal_v1_embedding')
  })

  it('buildPostSearchQuery includes both text and semantic ranking for hybrid search', () => {
    // Pre-computed embedding is required for semantic search
    const testEmbedding = Array(1024).fill(0.1) // Bedrock Nova embedding dimension
    const query = buildPostSearchQuery(undefined, {
      text_search_query: 'test query',
      semantic_search_query: 'test query',
      semanticSearchEmbedding: testEmbedding,
    })

    expect(query.sql).toContain('ranking_score')
    expect(query.sql).toContain('ts_rank')
    expect(query.sql).toContain('bedrock_nova_multimodal_v1_embedding')
  })

  it('buildPostSearchQuery filters by user_id', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery(undefined, {
      user_id: userId,
    })

    expect(query.sql).toContain('created_by_id')
    expect(query.values).toContain(userId)
  })

  it('buildPostSearchQuery filters by post_types', () => {
    const query = buildPostSearchQuery(undefined, {
      post_types: ['discussion', 'review'],
    })

    expect(query.sql).toContain('post_type = ANY')
  })

  it('buildPostSearchQuery uses posts.votes_score_sort directly for sort=best', () => {
    const query = buildPostSearchQuery(undefined, {
      sort: 'best',
    })

    expect(query.sql).not.toContain('JOIN post_elections')
    expect(query.sql).toContain('posts.votes_score_sort')
  })

  it('buildPostSearchQuery falls back to sort=new semantics for sort=relevance without search', () => {
    const query = buildPostSearchQuery(undefined, {
      sort: 'relevance',
    })

    expect(query.sql).not.toContain('JOIN post_elections')
    expect(query.sql).not.toContain('votes_score_sort')
    expect(query.sql).not.toContain('ranking_score')
    expect(query.sql).toContain('ORDER BY posts.id DESC')
  })

  it('buildPostSearchQuery adds id-based pagination filter for sort=relevance without search', () => {
    const testId = '123e4567-e89b-12d3-a456-426614174000'

    const query = buildPostSearchQuery(undefined, {
      sort: 'relevance',
      id_lt: testId,
    })

    expect(query.sql).toContain('posts.id < ?')
    expect(query.sql).not.toContain('votes_score_sort')
    expect(query.values).toContain(testId)
  })

  it('buildPostSearchQuery filters by review_topic_ids', () => {
    const topicId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery(undefined, {
      review_topic_ids: [topicId],
    })

    expect(query.sql).toContain('post_review_topic_ratings')
    expect(query.sql).toContain('topic_id')
    expect(query.values).toContain(topicId)
  })

  it('buildPostSearchQuery includes canonical URL CTE when url_id is provided', () => {
    const urlId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery(undefined, {
      url_id: urlId,
    })

    expect(query.sql).toContain('WITH')
    expect(query.sql).toContain('canonical_urls')
    expect(query.sql).toContain('RECURSIVE')
    expect(query.values).toContain(urlId)
  })

  it('buildPostSearchQuery adds EXISTS clause for related_topic_ids', () => {
    const topicId1 = '123e4567-e89b-12d3-a456-426614174001'
    const topicId2 = '123e4567-e89b-12d3-a456-426614174002'
    const query = buildPostSearchQuery(undefined, {
      related_topic_ids: [topicId1, topicId2],
    })

    expect(query.sql).toContain('EXISTS')
    expect(query.sql).toContain('relation__post__category__topic')
    expect(query.values).toContain(topicId1)
    expect(query.values).toContain(topicId2)
  })

  it('buildPostSearchQuery derives universal-topic membership from reverse-indexed candidates', () => {
    const topicId1 = '123e4567-e89b-12d3-a456-426614174001'
    const topicId2 = '123e4567-e89b-12d3-a456-426614174002'
    const query = buildPostSearchQuery(undefined, {
      universal_topic_ids: [topicId1, topicId2, topicId1],
    })

    expect(query.sql).toContain('posts.id IN')
    expect(query.sql).toContain('object_id = ANY')
    expect(query.sql).not.toContain('post_topic_alias_sources')
    expect(query.sql).toContain('FROM relation__post__category__topic_alias relation')
    expect(query.sql).toContain('JOIN topic_aliases alias ON alias.id = relation.object_id')
    expect(query.sql).toContain('alias.topic_id = ANY')
    expect(query.sql).toContain('AND deleted_at IS NULL')
    expect(query.sql).toContain('AND votes_score_net > 0')
    expect(query.sql.match(/UNION/g)).toHaveLength(3)
    expect(query.sql).toContain('GROUP BY universal_topic_candidates.post_id')
    expect(query.sql).toContain('HAVING COUNT(*) =')
    expect(query.sql).not.toContain('ptc.subject_id = posts.id')
    expect(query.values).toEqual(
      expect.arrayContaining([
        [topicId1, topicId2],
        [topicId1, topicId2],
        [topicId1, topicId2],
        [topicId1, topicId2],
        2,
      ]),
    )
  })

  it('buildPostSearchQuery ignores an empty universal-topic filter', () => {
    const query = buildPostSearchQuery(undefined, { universal_topic_ids: [] })

    expect(query.sql).not.toContain('universal_topic_candidates')
  })

  it('buildPostSearchQuery adds similar_post_id CTE and filter', () => {
    const postId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery(undefined, {
      similar_post_id: postId,
    })

    expect(query.sql).toContain('similar_post_embedding')
    expect(query.sql).toContain('<=>')
    expect(query.values).toContain(postId)
  })

  it('buildPostSearchQuery adds similar_topic_id CTE and filter', () => {
    const topicId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery(undefined, {
      similar_topic_id: topicId,
    })

    expect(query.sql).toContain('similar_topic_embedding')
    expect(query.sql).toContain('<=>')
    expect(query.values).toContain(topicId)
  })

  it('buildPostSearchQuery adds similar_rss_feed_item_id CTE and filter', () => {
    const rssFeedItemId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildPostSearchQuery(undefined, {
      similar_rss_feed_item_id: rssFeedItemId,
    })

    expect(query.sql).toContain('similar_rss_feed_item_embedding')
    expect(query.sql).toContain('<=>')
    expect(query.values).toContain(rssFeedItemId)
  })

  it('buildPostSearchQuery uses provided limit without clamping', () => {
    // Query builder should trust the caller has already clamped
    // This is necessary for limit+1 overfetch pattern to work correctly
    const query = buildPostSearchQuery(undefined, {
      limit: 101, // get-ids passes limit+1 for overfetch
    })

    expect(query.values).toContain(101)
  })

  it('buildPostSearchQuery uses default limit when not provided', () => {
    const query = buildPostSearchQuery(undefined, {
      // No limit provided
    })

    expect(query.values).toContain(100)
  })
})
