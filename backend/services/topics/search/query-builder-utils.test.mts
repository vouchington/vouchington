import { expect, it, describe } from 'vitest'
import { buildTopicSemanticRankingScoreSql, escapeLikePattern } from './query-builder-utils.mts'

describe('query-builder-utils', () => {
  it('buildTopicSemanticRankingScoreSql throws when no semantic/similar signals are provided', () => {
    expect(() =>
      buildTopicSemanticRankingScoreSql({
        semanticAnchorCte: null,
        secondarySemanticCtes: [],
      }),
    ).toThrow('requires at least one semantic/similar search signal')
  })

  it('buildTopicSemanticRankingScoreSql uses precomputed embedding_distance for the anchor and multiplies secondary signals', () => {
    const ranking = buildTopicSemanticRankingScoreSql({
      semanticAnchorCte: 'semantic_search_embedding',
      secondarySemanticCtes: ['similar_post_embedding'],
    })

    expect(ranking.sql).toContain('t.embedding_distance')
    expect(ranking.sql).toContain('similar_post_embedding.embedding')
    expect(ranking.sql).toContain(' * ')
    expect(ranking.sql).not.toContain('similar_topic_embedding.embedding')
  })

  it('buildTopicSemanticRankingScoreSql uses embedding_distance alone for single-signal search', () => {
    const ranking = buildTopicSemanticRankingScoreSql({
      semanticAnchorCte: 'similar_rss_feed_item_embedding',
      secondarySemanticCtes: [],
    })

    expect(ranking.sql).toBe('(1.0 / (1.0 + (t.embedding_distance)))')
  })

  it('escapeLikePattern escapes LIKE metacharacters and backslashes', () => {
    expect(escapeLikePattern('100%_\\cards')).toBe('100\\%\\_\\\\cards')
  })
})
