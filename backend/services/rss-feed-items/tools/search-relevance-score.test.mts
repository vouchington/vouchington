import { describe, expect, it } from 'vitest'
import { buildRssFeedItemRelevanceScoreExpression } from './search-relevance-score.mts'

describe('buildRssFeedItemRelevanceScoreExpression', () => {
  it('throws when no relevance signals are enabled', () => {
    expect(() =>
      buildRssFeedItemRelevanceScoreExpression({
        hasSemanticSearch: false,
        hasSimilarPostSearch: false,
        hasSimilarTopicSearch: false,
        hasSimilarRssFeedItemSearch: false,
      }),
    ).toThrow('requires at least one semantic/similar search signal')
  })

  it('combines enabled signals with multiplicative scoring', () => {
    const expression = buildRssFeedItemRelevanceScoreExpression({
      hasSemanticSearch: true,
      hasSimilarPostSearch: true,
      hasSimilarTopicSearch: false,
      hasSimilarRssFeedItemSearch: false,
    })

    expect(expression.text).toContain('semantic_search_embedding.embedding')
    expect(expression.text).toContain('similar_post_embedding.embedding')
    expect(expression.text).toContain(' * ')
    expect(expression.text).not.toContain(') / ')
  })
})
