import { expect, it, describe } from 'vitest'
import { buildTopicSemanticRankingScoreSql, escapeLikePattern } from './query-builder-utils.mts'

describe('query-builder-utils', () => {
  it('buildTopicSemanticRankingScoreSql throws when no semantic/similar signals are provided', () => {
    expect(() =>
      buildTopicSemanticRankingScoreSql({
        hasSemanticSearch: false,
        hasSimilarPostSearch: false,
        hasSimilarTopicSearch: false,
        hasSimilarRssFeedItemSearch: false,
      }),
    ).toThrow('requires at least one semantic/similar search signal')
  })

  it('buildTopicSemanticRankingScoreSql composes score factors for enabled signals', () => {
    const ranking = buildTopicSemanticRankingScoreSql({
      hasSemanticSearch: true,
      hasSimilarPostSearch: true,
      hasSimilarTopicSearch: false,
      hasSimilarRssFeedItemSearch: false,
    })

    expect(ranking.sql).toContain('semantic_search_embedding.embedding')
    expect(ranking.sql).toContain('similar_post_embedding.embedding')
    expect(ranking.sql).toContain(' * ')
    expect(ranking.sql).not.toContain('similar_topic_embedding.embedding')
  })

  it('buildTopicSemanticRankingScoreSql includes rss feed item similarity factor', () => {
    const ranking = buildTopicSemanticRankingScoreSql({
      hasSemanticSearch: false,
      hasSimilarPostSearch: false,
      hasSimilarTopicSearch: false,
      hasSimilarRssFeedItemSearch: true,
    })

    expect(ranking.sql).toContain('similar_rss_feed_item_embedding.embedding')
  })

  it('escapeLikePattern escapes LIKE metacharacters and backslashes', () => {
    expect(escapeLikePattern('100%_\\cards')).toBe('100\\%\\_\\\\cards')
  })
})
