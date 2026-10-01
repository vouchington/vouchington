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
    const outerStart = query.sql.indexOf('JOIN semantic_post_candidates')
    const candidateSql = query.sql.slice(windowStart, outerStart)
    expect(candidateSql).toContain('posts.search_vector @@ text_search_tsquery.tsquery')
    expect(candidateSql).toContain('deleted_at IS NULL')
    expect(candidateSql).toContain('ORDER BY posts.bedrock_nova_multimodal_v1_embedding <=>')
    expect(candidateSql).not.toContain('posts.id) <')
    expect(query.sql.slice(outerStart)).toContain('posts.id) <')
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
    expect(query.sql.match(/LIMIT/g)).toHaveLength(1)
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
