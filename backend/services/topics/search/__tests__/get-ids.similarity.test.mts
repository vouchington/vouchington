import { describe, expect } from 'vitest'
import { insertTestTopic, updateTopicEmbeddingData } from '@voucha/test-helpers'
import { getTopicIds } from '../get-ids.mts'
import { registerSimilaritySearchTests } from '../../../../test-helpers/similarity-search-tests.mts'

describe('get-ids (similarity search)', () => {
  registerSimilaritySearchTests({
    similarHash: 'similar-topic-test',
    semanticHash: 'semantic-topic-cache-test',
    insert: (userId, label) =>
      insertTestTopic({
        name: `${label} ${Math.random()}`,
        slug: `sim-topic-${label}-${Date.now()}-${Math.random()}`,
        createdById: userId,
      }),
    updateEmbedding: (topicId, inputSha256, embedding) =>
      updateTopicEmbeddingData({ topicId, inputSha256, embedding, tokens: 10 }),
    searchSimilar: (_user, sourceId, after) =>
      getTopicIds({ similar_topic_id: sourceId, sort: 'relevance', limit: 1, after }),
    searchBare: (_user, sourceId) =>
      getTopicIds({ similar_topic_id: sourceId, sort: 'relevance', limit: 5 }),
    searchSemantic: (_user, query) =>
      getTopicIds({ semantic_search_query: query, sort: 'relevance', limit: 5 }),
    onPage: (result, sourceId) => {
      // oxlint-disable-next-line vitest/no-standalone-expect, jest/no-standalone-expect -- called from the shared pagination test
      expect(result.results.some(row => row.id === sourceId)).toBe(false)
    },
  })
})
