import { expect, it, describe } from 'vitest'
import { buildEmbeddingCtes } from './embedding-ctes.mts'

describe('embedding-ctes', () => {
  const VALID_RSS_FEED_ITEM_ID = '018f1234-5678-7abc-def0-123456789abe'
  const VALID_POST_ID = '018f1234-5678-7abc-def0-123456789abc'
  const VALID_TOPIC_ID = '018f1234-5678-7abc-def0-123456789abd'

  it('buildEmbeddingCtes returns empty array when no options provided', () => {
    expect(buildEmbeddingCtes({})).toHaveLength(0)
  })

  it('buildEmbeddingCtes returns semantic search CTE when vector provided', () => {
    const ctes = buildEmbeddingCtes({ semanticSearchEmbeddingVector: '[0.1,0.2,0.3]' })
    expect(ctes).toHaveLength(1)
    expect(ctes[0].text).toContain('semantic_search_embedding')
    expect(ctes[0].text).toContain('::vector AS embedding')
  })

  it('buildEmbeddingCtes returns similar_post CTE when post ID provided', () => {
    const ctes = buildEmbeddingCtes({ similar_post_id: VALID_POST_ID })
    expect(ctes).toHaveLength(1)
    expect(ctes[0].text).toContain('similar_post_embedding')
    expect(ctes[0].text).toContain('FROM posts')
  })

  it('buildEmbeddingCtes returns similar_topic CTE when topic ID provided', () => {
    const ctes = buildEmbeddingCtes({ similar_topic_id: VALID_TOPIC_ID })
    expect(ctes).toHaveLength(1)
    expect(ctes[0].text).toContain('similar_topic_embedding')
    expect(ctes[0].text).toContain('FROM topics')
  })

  it('buildEmbeddingCtes returns similar_rss_feed_item CTE when valid UUID provided', () => {
    const ctes = buildEmbeddingCtes({ similar_rss_feed_item_id: VALID_RSS_FEED_ITEM_ID })
    expect(ctes).toHaveLength(1)
    expect(ctes[0].text).toContain('similar_rss_feed_item_embedding')
    expect(ctes[0].text).toContain('FROM rss_feed_items')
  })

  it('buildEmbeddingCtes parameterizes the rss feed item UUID', () => {
    const ctes = buildEmbeddingCtes({ similar_rss_feed_item_id: VALID_RSS_FEED_ITEM_ID })
    expect(ctes[0].values).toContain(VALID_RSS_FEED_ITEM_ID)
  })

  it('buildEmbeddingCtes returns multiple CTEs when multiple options provided', () => {
    const ctes = buildEmbeddingCtes({
      semanticSearchEmbeddingVector: '[0.1,0.2]',
      similar_post_id: VALID_POST_ID,
      similar_topic_id: VALID_TOPIC_ID,
      similar_rss_feed_item_id: VALID_RSS_FEED_ITEM_ID,
    })
    expect(ctes).toHaveLength(4)
  })

  it('buildEmbeddingCtes still builds CTE for any non-empty string (validation is caller responsibility)', () => {
    const ctes = buildEmbeddingCtes({ similar_rss_feed_item_id: 'not-a-uuid-at-all' })
    expect(ctes).toHaveLength(1)
    expect(ctes[0].text).toContain('similar_rss_feed_item_embedding')
  })
})
