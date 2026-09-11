import { expect, it, describe } from 'vitest'
import { buildSemanticRankingScore } from './semantic-ranking-score.mts'

describe('semantic-ranking-score', () => {
  const COL = 't.bedrock_nova_multimodal_v1_embedding'

  const allFalse = {
    hasSemanticSearch: false,
    hasSimilarPostSearch: false,
    hasSimilarTopicSearch: false,
    hasSimilarRssFeedItemSearch: false,
  }

  it('buildSemanticRankingScore throws when no signals are active', () => {
    expect(() => buildSemanticRankingScore(COL, allFalse)).toThrow(
      /requires at least one semantic\/similar search signal/,
    )
  })

  it('buildSemanticRankingScore single semantic signal produces correct expression', () => {
    const result = buildSemanticRankingScore(COL, { ...allFalse, hasSemanticSearch: true })
    expect(result.text).toContain('semantic_search_embedding.embedding')
    expect(result.text).toContain('1.0 / (1.0 +')
    // Single signal: no multiplication
    expect(result.text).not.toContain('*')
  })

  it('buildSemanticRankingScore single similar_post signal', () => {
    const result = buildSemanticRankingScore(COL, { ...allFalse, hasSimilarPostSearch: true })
    expect(result.text).toContain('similar_post_embedding.embedding')
    expect(result.text).not.toContain('*')
  })

  it('buildSemanticRankingScore single similar_topic signal', () => {
    const result = buildSemanticRankingScore(COL, { ...allFalse, hasSimilarTopicSearch: true })
    expect(result.text).toContain('similar_topic_embedding.embedding')
  })

  it('buildSemanticRankingScore single similar_rss_feed_item signal', () => {
    const result = buildSemanticRankingScore(COL, {
      ...allFalse,
      hasSimilarRssFeedItemSearch: true,
    })
    expect(result.text).toContain('similar_rss_feed_item_embedding.embedding')
  })

  it('buildSemanticRankingScore two signals produces product expression', () => {
    const result = buildSemanticRankingScore(COL, {
      ...allFalse,
      hasSemanticSearch: true,
      hasSimilarPostSearch: true,
    })
    expect(result.text).toContain('semantic_search_embedding.embedding')
    expect(result.text).toContain('similar_post_embedding.embedding')
    expect(result.text).toContain('*')
  })

  it('buildSemanticRankingScore all four signals produces product of four factors', () => {
    const result = buildSemanticRankingScore(COL, {
      hasSemanticSearch: true,
      hasSimilarPostSearch: true,
      hasSimilarTopicSearch: true,
      hasSimilarRssFeedItemSearch: true,
    })
    expect(result.text).toContain('semantic_search_embedding.embedding')
    expect(result.text).toContain('similar_post_embedding.embedding')
    expect(result.text).toContain('similar_topic_embedding.embedding')
    expect(result.text).toContain('similar_rss_feed_item_embedding.embedding')
    // Three multiplication operators for four factors
    expect(result.text.split('*').length - 1).toBe(3)
  })

  it('buildSemanticRankingScore uses provided embeddingColumn in SQL', () => {
    const customCol = 'rss_feed_items.bedrock_nova_multimodal_v1_embedding'
    const result = buildSemanticRankingScore(customCol, { ...allFalse, hasSemanticSearch: true })
    expect(result.text).toContain(customCol)
  })
})
