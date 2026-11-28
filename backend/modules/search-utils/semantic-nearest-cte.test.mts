import { describe, expect, it } from 'vitest'
import { buildSemanticNearestCte } from './semantic-nearest-cte.mts'

describe('buildSemanticNearestCte', () => {
  it('builds a materialized HNSW k-nearest prefix CTE with filters and LEAST(k, max)', () => {
    const cte = buildSemanticNearestCte({
      selectColumns: ['t.id', 't.name'],
      from: 'topics t',
      embeddingColumn: 't.bedrock_nova_multimodal_v1_embedding',
      whereClauses: ['t.deleted_at IS NULL', 't.merged_into_topic_id IS NULL'],
      candidateLimit: 100,
      maxCandidateLimit: 250,
    })

    expect(cte.text).toContain('semantic_nearest AS MATERIALIZED (')
    expect(cte.text).toContain('t.id,\n        t.name')
    expect(cte.text).toContain(
      '(t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) AS embedding_distance',
    )
    expect(cte.text).toContain('FROM topics t')
    expect(cte.text).toContain('CROSS JOIN semantic_search_embedding')
    expect(cte.text).toContain(
      'WHERE t.deleted_at IS NULL AND t.merged_into_topic_id IS NULL AND t.bedrock_nova_multimodal_v1_embedding IS NOT NULL',
    )
    expect(cte.text).toContain(
      'ORDER BY t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding',
    )
    expect(cte.text).toContain('LIMIT LEAST(100, 250)')
    expect(cte.values).toEqual([])
  })

  it('works when no extra whereClauses are supplied', () => {
    const cte = buildSemanticNearestCte({
      selectColumns: ['rss_feed_items.id'],
      from: 'rss_feed_items',
      embeddingColumn: 'rss_feed_items.bedrock_nova_multimodal_v1_embedding',
      whereClauses: [],
      candidateLimit: 200,
      maxCandidateLimit: 1000,
    })

    expect(cte.text).toContain(
      'WHERE rss_feed_items.bedrock_nova_multimodal_v1_embedding IS NOT NULL',
    )
    expect(cte.text).toContain('LIMIT LEAST(200, 1000)')
    expect(cte.values).toEqual([])
  })

  it('builds a CROSS JOIN LATERAL prefix CTE when lateralAnchor is provided', () => {
    const cte = buildSemanticNearestCte({
      selectColumns: ['t.id', 't.name'],
      from: 'topics t',
      embeddingColumn: 't.bedrock_nova_multimodal_v1_embedding',
      whereClauses: ['t.deleted_at IS NULL'],
      candidateLimit: 200,
      maxCandidateLimit: 500,
      lateralAnchor: {
        cte: 'similar_topic_embedding',
        outerSelectColumns: ['nearest.id', 'nearest.name'],
      },
    })

    expect(cte.text).toContain('semantic_nearest AS MATERIALIZED (')
    expect(cte.text).toContain(
      'nearest.id,\n        nearest.name,\n        nearest.embedding_distance',
    )
    expect(cte.text).toContain('FROM similar_topic_embedding anchor_embedding')
    expect(cte.text).toContain('CROSS JOIN LATERAL (')
    expect(cte.text).toContain(
      '(t.bedrock_nova_multimodal_v1_embedding <=> anchor_embedding.embedding) AS embedding_distance',
    )
    expect(cte.text).toContain(
      'ORDER BY t.bedrock_nova_multimodal_v1_embedding <=> anchor_embedding.embedding',
    )
    expect(cte.text).toContain('LIMIT LEAST(200, 500)')
    expect(cte.text).toContain(') nearest')
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid candidateLimit %s',
    invalid => {
      expect(() =>
        buildSemanticNearestCte({
          selectColumns: ['t.id'],
          from: 'topics t',
          embeddingColumn: 't.bedrock_nova_multimodal_v1_embedding',
          whereClauses: [],
          candidateLimit: invalid,
          maxCandidateLimit: 250,
        }),
      ).toThrow('Invalid semantic candidate limit')
    },
  )

  it.each([0, -5, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maxCandidateLimit %s',
    invalid => {
      expect(() =>
        buildSemanticNearestCte({
          selectColumns: ['t.id'],
          from: 'topics t',
          embeddingColumn: 't.bedrock_nova_multimodal_v1_embedding',
          whereClauses: [],
          candidateLimit: 100,
          maxCandidateLimit: invalid,
        }),
      ).toThrow('Invalid semantic candidate hard maximum')
    },
  )
})
