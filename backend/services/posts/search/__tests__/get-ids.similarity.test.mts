import { describe } from 'vitest'
import { insertTestPost, updatePostEmbeddingData } from '@voucha/test-helpers'
import { getPostIds } from '../get-ids.mts'
import { registerSimilaritySearchTests } from '../../../../test-helpers/similarity-search-tests.mts'

describe('get-ids (similarity search)', () => {
  registerSimilaritySearchTests({
    similarHash: 'similar-post-test',
    semanticHash: 'semantic-post-cache-test',
    insert: (userId, label) =>
      insertTestPost({
        title: `${label} ${Math.random()}`,
        slug: `sim-post-${label}-${Date.now()}-${Math.random()}`,
        markdown: `${label} post for similarity test`,
        createdById: userId,
      }),
    updateEmbedding: (postId, inputSha256, embedding) =>
      updatePostEmbeddingData({ postId, inputSha256, embedding, tokens: 10 }),
    searchSimilar: (user, sourceId, after) =>
      getPostIds(user, { similar_post_id: sourceId, sort: 'relevance', limit: 1, after }),
    searchBare: (user, sourceId) =>
      getPostIds(user, { similar_post_id: sourceId, sort: 'relevance', limit: 5 }),
    searchSemantic: (user, query) =>
      getPostIds(user, { semantic_search_query: query, sort: 'relevance', limit: 5 }),
  })
})
