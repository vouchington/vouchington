import { describe, expect, it } from 'vitest'
import { buildPostSearchQuery } from '../query-builder.mts'
import { SEMANTIC_POST_CANDIDATE_LIMIT } from '../query-builder/semantic-candidates.mts'

describe('semantic candidate window', () => {
  it('caps filtered candidates before applying a relevance cursor', () => {
    const query = buildPostSearchQuery(undefined, {
      semantic_search_query: 'query',
      text_search_query: 'hybrid',
      semanticSearchEmbedding: [1, ...Array<number>(1023).fill(0)],
      user_id: '019e0000-0000-7000-8000-000000000001',
      sort: 'relevance',
      ranking_lt: 0.6,
      id_lt: '019e0000-0000-7000-8000-000000000002',
      limit: 26,
    })
    const windowStart = query.sql.indexOf('semantic_post_candidates AS MATERIALIZED')
    const outerStart = query.sql.indexOf('FROM semantic_post_candidates')
    const candidateSql = query.sql.slice(windowStart, outerStart)
    expect(candidateSql).toContain('posts.search_vector @@ text_search_tsquery.tsquery')
    expect(candidateSql).toContain('deleted_at IS NULL')
    expect(candidateSql).toContain(
      'ORDER BY semantic_vector_post.bedrock_nova_multimodal_v1_embedding <=>',
    )
    expect(candidateSql).toContain('FROM posts semantic_vector_post')
    expect(candidateSql).toContain(
      'WHERE semantic_vector_post.bedrock_nova_multimodal_v1_embedding IS NOT NULL',
    )
    expect(candidateSql).toContain('AND posts.id = semantic_vector_post.id')
    expect(candidateSql).toContain('LIMIT 1\n    ) semantic_eligible_post')
    expect(candidateSql.indexOf('posts.search_vector @@')).toBeLessThan(
      candidateSql.indexOf('LIMIT 1'),
    )
    expect(candidateSql).not.toContain(', posts.id DESC')
    expect(query.sql).toContain('semantic_search_embedding AS NOT MATERIALIZED')
    expect(query.sql).toContain('text_search_tsquery AS NOT MATERIALIZED')
    expect(candidateSql).toContain('semantic_search_embedding.embedding\n    LIMIT')
    expect(candidateSql).not.toContain('posts.id) <')
    expect(query.sql.slice(outerStart)).toContain('posts.id) <')
    expect(query.sql.slice(outerStart)).toContain('CROSS JOIN LATERAL')
    expect(query.sql.slice(outerStart)).toContain(
      'semantic_selected_post.id = semantic_post_candidates.id',
    )
    expect(query.values).toContain(SEMANTIC_POST_CANDIDATE_LIMIT)
    expect(query.values).toContain(26)
  })

  it('keeps the candidate cap even when outer limits and order are omitted for facets', () => {
    const query = buildPostSearchQuery(undefined, {
      semantic_search_query: 'query',
      semanticSearchEmbedding: [1, ...Array<number>(1023).fill(0)],
      omitLimit: true,
      omitOrderBy: true,
    })
    expect(query.sql.match(/LIMIT/g)).toHaveLength(3)
    expect(query.values).toContain(SEMANTIC_POST_CANDIDATE_LIMIT)
  })

  it('preserves text-only and similar-item query paths', () => {
    for (const options of [
      { text_search_query: 'query' },
      { similar_post_id: '019e0000-0000-7000-8000-000000000003' },
      { semantic_search_query: 'query' },
    ]) {
      expect(buildPostSearchQuery(undefined, options).sql).not.toContain('semantic_post_candidates')
    }
  })
})
