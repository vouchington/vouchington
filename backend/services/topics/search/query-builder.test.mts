import { expect, it, describe } from 'vitest'
import { buildTopicSearchQuery } from './query-builder.mts'

describe('query-builder', () => {
  const testEmbedding = Array.from({ length: 1024 }, (_, i) => ((i % 7) + 1) / 10)

  it('buildTopicSearchQuery includes relevance_tier in SELECT only for sort=relevance with text search', () => {
    const relevanceWithSearch = buildTopicSearchQuery({ text_search_query: 'amex' }, 'relevance')
    const relevanceWithoutSearch = buildTopicSearchQuery({}, 'relevance')
    const bestWithSearch = buildTopicSearchQuery({ text_search_query: 'amex' }, 'best')

    expect(relevanceWithSearch.sql).toContain('tier_calc.relevance_tier')
    expect(relevanceWithoutSearch.sql).not.toContain('tier_calc.relevance_tier')
    expect(bestWithSearch.sql).not.toContain('tier_calc.relevance_tier')
  })

  it('buildTopicSearchQuery supports semantic-only relevance search', () => {
    const query = buildTopicSearchQuery(
      {
        semantic_search_query: 'amex',
        semanticSearchEmbedding: testEmbedding,
      },
      'relevance',
    )

    expect(query.sql).toContain('WITH')
    expect(query.sql).toContain('semantic_search_embedding AS')
    expect(query.sql).toContain('CROSS JOIN semantic_search_embedding')
    expect(query.sql).toContain('AS ranking_score')
    expect(query.sql).toContain('t.bedrock_nova_multimodal_v1_embedding IS NOT NULL')
    expect(query.sql).toContain(
      '(t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) < ?',
    )
    expect(query.sql).toContain('ORDER BY ranking_score DESC, t.id DESC')
  })

  it('buildTopicSearchQuery supports similar_post_id and similar_topic_id filters', () => {
    const query = buildTopicSearchQuery(
      {
        similar_post_id: 'post-123',
        similar_topic_id: 'topic-123',
      },
      'new',
    )

    expect(query.sql).toContain('similar_post_embedding AS')
    expect(query.sql).toContain('similar_topic_embedding AS')
    expect(query.sql).toContain('CROSS JOIN similar_post_embedding')
    expect(query.sql).toContain('CROSS JOIN similar_topic_embedding')
    expect(query.sql).toContain(
      '(t.bedrock_nova_multimodal_v1_embedding <=> similar_post_embedding.embedding) < ?',
    )
    expect(query.sql).toContain(
      '(t.bedrock_nova_multimodal_v1_embedding <=> similar_topic_embedding.embedding) < ?',
    )
    expect(query.sql).toContain('t.id <> ?')
  })

  it('buildTopicSearchQuery supports similar_rss_feed_item_id filters', () => {
    const rssFeedItemId = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildTopicSearchQuery(
      {
        similar_rss_feed_item_id: rssFeedItemId,
      },
      'new',
    )

    expect(query.sql).toContain('similar_rss_feed_item_embedding AS')
    expect(query.sql).toContain('CROSS JOIN similar_rss_feed_item_embedding')
    expect(query.sql).toContain(
      '(t.bedrock_nova_multimodal_v1_embedding <=> similar_rss_feed_item_embedding.embedding) < ?',
    )
    expect(query.values).toContain(rssFeedItemId)
  })

  it('buildTopicSearchQuery supports hybrid text + semantic search and keeps tier relevance ordering', () => {
    const query = buildTopicSearchQuery(
      {
        text_search_query: 'amex',
        semantic_search_query: 'amex',
        semanticSearchEmbedding: testEmbedding,
      },
      'relevance',
    )

    expect(query.sql).toContain('CROSS JOIN LATERAL')
    expect(query.sql).toContain('tier_calc.relevance_tier')
    expect(query.sql).toContain('semantic_search_embedding AS')
    expect(query.sql).toContain('CROSS JOIN semantic_search_embedding')
    expect(query.sql).toContain(
      '(t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) < ?',
    )
    expect(query.sql).toContain('ORDER BY')
    expect(query.sql).toContain('tier_calc.relevance_tier ASC')
    expect(query.sql).not.toContain('ORDER BY ranking_score DESC, t.id DESC')
  })

  it('buildTopicSearchQuery includes LATERAL tier join only for sort=relevance with text search', () => {
    const relevanceWithSearch = buildTopicSearchQuery({ text_search_query: 'amex' }, 'relevance')
    const relevanceWithoutSearch = buildTopicSearchQuery({}, 'relevance')
    const bestWithSearch = buildTopicSearchQuery({ text_search_query: 'amex' }, 'best')

    expect(relevanceWithSearch.sql).toContain('CROSS JOIN LATERAL')
    expect(relevanceWithoutSearch.sql).not.toContain('CROSS JOIN LATERAL')
    expect(bestWithSearch.sql).not.toContain('CROSS JOIN LATERAL')
  })

  it('buildTopicSearchQuery ignores whitespace-only text_search_query', () => {
    const query = buildTopicSearchQuery({ text_search_query: '   ' }, 'relevance')

    expect(query.sql).not.toContain('CROSS JOIN LATERAL')
    expect(query.sql).not.toContain('ILIKE')
    expect(query.sql).toContain('ORDER BY t.id DESC')
  })

  it('buildTopicSearchQuery trims text_search_query for LATERAL relevance tier classification', () => {
    const query = buildTopicSearchQuery({ text_search_query: ' apple ' }, 'relevance')

    const escapedPrefix = 'apple'
    const escapedContains = '%apple%'

    expect(query.values).toContain('apple') // exact-match tier CASE arm is trimmed
    expect(query.values).not.toContain(' apple ')
    expect(query.values.filter(value => value === escapedPrefix).length).toBe(3)
    expect(query.values.filter(value => value === escapedContains).length).toBe(2)
  })

  it('buildTopicSearchQuery tier-1 prefix classification includes slug prefix matches', () => {
    const query = buildTopicSearchQuery({ text_search_query: 'amex' }, 'relevance')

    expect(query.sql).toContain("OR t.slug ILIKE ? || '%'")
  })

  it('buildTopicSearchQuery adds composite keyset WHERE clause for sort=relevance (tier/id)', () => {
    const tier = 1
    const id = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildTopicSearchQuery(
      {
        text_search_query: 'amex',
        tier_after: tier,
        id_lt: id,
      },
      'relevance',
    )

    expect(query.sql).toContain('tier_calc.relevance_tier > ?')
    expect(query.sql).toContain('(tier_calc.relevance_tier = ? AND t.id < ?)')
    expect(query.values).toContain(tier)
    expect(query.values).toContain(id)
  })

  it('buildTopicSearchQuery adds composite keyset WHERE clause for sort=best (score/id)', () => {
    const score = 0.42
    const id = '123e4567-e89b-12d3-a456-426614174000'
    const query = buildTopicSearchQuery(
      {
        score_lt: score,
        id_lt: id,
      },
      'best',
    )

    expect(query.sql).toContain('(COALESCE(tm.ratings__score__sort, 0), t.id) < (?, ?)')
    expect(query.values).toContain(score)
    expect(query.values).toContain(id)
  })

  it('buildTopicSearchQuery escapes LIKE metacharacters in all generated patterns', () => {
    const textSearchQuery = '100%_\\cards'
    const escaped = '100\\%\\_\\\\cards'
    const escapedContains = `%${escaped}%`
    const unescapedContains = `%${textSearchQuery}%`
    const query = buildTopicSearchQuery({ text_search_query: textSearchQuery }, 'relevance')

    const escapedPrefixCount = query.values.filter(value => value === escaped).length
    const escapedContainsCount = query.values.filter(value => value === escapedContains).length

    expect(query.values).toContain(textSearchQuery) // Exact-match tier check
    expect(escapedPrefixCount).toBe(2) // Prefix tier checks for name and slug
    expect(escapedContainsCount).toBe(2) // name ILIKE and slug ILIKE filters
    expect(query.values).not.toContain(unescapedContains)
  })

  it('buildTopicSearchQuery applies hashtag_topic_ids as direct id filter', () => {
    const query = buildTopicSearchQuery({ hashtag_topic_ids: ['id-one', 'id-two'] }, 'new')
    expect(query.sql).toContain('t.id = ANY(?)')
    expect(query.values).toContainEqual(['id-one', 'id-two'])
  })

  it('buildTopicSearchQuery ORDER BY changes based on sort mode', () => {
    const relevanceWithSearch = buildTopicSearchQuery({ text_search_query: 'amex' }, 'relevance')
    const relevanceWithoutSearch = buildTopicSearchQuery({}, 'relevance')
    const newest = buildTopicSearchQuery({}, 'new')
    const best = buildTopicSearchQuery({}, 'best')

    expect(relevanceWithSearch.sql).toContain('ORDER BY')
    expect(relevanceWithSearch.sql).toContain('tier_calc.relevance_tier ASC')
    expect(relevanceWithSearch.sql).toContain('t.id DESC')

    expect(relevanceWithoutSearch.sql).toContain('ORDER BY t.id DESC')
    expect(newest.sql).toContain('ORDER BY t.id DESC')
    expect(best.sql).toContain('LEFT JOIN topic_metrics tm ON tm.topic_id = t.id')
    expect(best.sql).toContain('ORDER BY COALESCE(tm.ratings__score__sort, 0) DESC, t.id DESC')
  })
})
